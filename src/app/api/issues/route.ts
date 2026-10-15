import { NextRequest, NextResponse } from 'next/server'
import * as k8s from '@kubernetes/client-node'
import { getKubeConfig } from '@/lib/k8s-client'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const RECENT_EVENT_WINDOW_MS = 30 * 60 * 1000
const PENDING_POD_THRESHOLD_MS = 5 * 60 * 1000
const RESTART_WARNING_THRESHOLD = 5
type KubernetesEvent = Awaited<ReturnType<k8s.CoreV1Api['listEventForAllNamespaces']>>['items'][number]

export interface ClusterIssue {
  id: string
  severity: 'critical' | 'warning'
  title: string
  resourceKind: string
  resourceName: string
  namespace?: string
  message: string
  recommendation: string
  since?: string
}

function detectPodIssues(pods: k8s.V1Pod[], now: number): ClusterIssue[] {
  const issues: ClusterIssue[] = []

  for (const pod of pods) {
    const name = pod.metadata?.name || 'unknown'
    const namespace = pod.metadata?.namespace || 'default'
    const phase = pod.status?.phase || 'Unknown'
    const containers = pod.status?.containerStatuses || []
    const waitingContainer = containers.find(container => container.state?.waiting?.reason)
    const waitingReason = waitingContainer?.state?.waiting?.reason
    const podAge = now - new Date(pod.metadata?.creationTimestamp || now).getTime()

    if (phase === 'Failed') {
      issues.push({
        id: `pod-failed/${namespace}/${name}`,
        severity: 'critical',
        title: 'Pod failed',
        resourceKind: 'Pod',
        resourceName: name,
        namespace,
        message: `Pod phase is Failed${pod.status?.reason ? ` (${pod.status.reason})` : ''}.`,
        recommendation: 'Inspect pod events and container logs, then correct the reported failure.'
      })
      continue
    }

    if (waitingReason) {
      const isCrashLoop = waitingReason === 'CrashLoopBackOff'
      issues.push({
        id: `pod-waiting/${namespace}/${name}/${waitingReason}`,
        severity: isCrashLoop ? 'critical' : 'warning',
        title: isCrashLoop ? 'Container is crash looping' : `Container is waiting: ${waitingReason}`,
        resourceKind: 'Pod',
        resourceName: name,
        namespace,
        message: `${waitingContainer?.name || 'A container'} is waiting${waitingContainer?.state?.waiting?.message ? `: ${waitingContainer.state.waiting.message}` : '.'}`,
        recommendation: isCrashLoop
          ? 'Check the container logs and previous termination reason; fix the application or its configuration.'
          : waitingReason.includes('Image')
            ? 'Verify the image name, tag, registry access, and image-pull credentials.'
            : 'Inspect the pod description and events to identify why the container cannot start.'
      })
      continue
    }

    if (phase === 'Pending' && podAge >= PENDING_POD_THRESHOLD_MS) {
      issues.push({
        id: `pod-pending/${namespace}/${name}`,
        severity: 'warning',
        title: 'Pod has been pending',
        resourceKind: 'Pod',
        resourceName: name,
        namespace,
        message: `Pod has remained Pending for at least ${Math.floor(podAge / 60000)} minutes.`,
        recommendation: 'Check scheduling events, node capacity, resource requests, and persistent-volume claims.',
        since: pod.metadata?.creationTimestamp?.toISOString()
      })
      continue
    }

    const unreadyContainer = containers.find(container => !container.ready)
    if (phase === 'Running' && unreadyContainer) {
      issues.push({
        id: `pod-unready/${namespace}/${name}/${unreadyContainer.name}`,
        severity: 'warning',
        title: 'Container is not ready',
        resourceKind: 'Pod',
        resourceName: name,
        namespace,
        message: `Container ${unreadyContainer.name} is running but not ready.`,
        recommendation: 'Check readiness probe configuration and application health.'
      })
      continue
    }

    const restartingContainer = containers.find(container => container.restartCount >= RESTART_WARNING_THRESHOLD)
    if (restartingContainer) {
      issues.push({
        id: `pod-restarts/${namespace}/${name}/${restartingContainer.name}`,
        severity: 'warning',
        title: 'Container has restarted repeatedly',
        resourceKind: 'Pod',
        resourceName: name,
        namespace,
        message: `${restartingContainer.name} has restarted ${restartingContainer.restartCount} times.`,
        recommendation: 'Inspect current and previous container logs, resource limits, and liveness probes.'
      })
    }
  }

  return issues
}

function detectNodeIssues(nodes: k8s.V1Node[]): ClusterIssue[] {
  return nodes.flatMap(node => {
    const name = node.metadata?.name || 'unknown'
    const readyCondition = node.status?.conditions?.find(condition => condition.type === 'Ready')

    if (!readyCondition || readyCondition.status === 'True') {
      return []
    }

    return [{
      id: `node-not-ready/${name}`,
      severity: 'critical' as const,
      title: 'Node is not ready',
      resourceKind: 'Node',
      resourceName: name,
      message: readyCondition.message || `Node Ready condition is ${readyCondition.status}.`,
      recommendation: 'Check node health, kubelet status, network connectivity, and recent node events.',
      since: readyCondition.lastTransitionTime?.toISOString()
    }]
  })
}

function detectDeploymentIssues(deployments: k8s.V1Deployment[]): ClusterIssue[] {
  return deployments.flatMap(deployment => {
    const name = deployment.metadata?.name || 'unknown'
    const namespace = deployment.metadata?.namespace || 'default'
    const desired = deployment.spec?.replicas ?? 1
    const available = deployment.status?.availableReplicas ?? 0

    if (available >= desired || desired === 0) {
      return []
    }

    return [{
      id: `deployment-unavailable/${namespace}/${name}`,
      severity: available === 0 ? 'critical' as const : 'warning' as const,
      title: available === 0 ? 'Deployment has no available replicas' : 'Deployment is below desired replicas',
      resourceKind: 'Deployment',
      resourceName: name,
      namespace,
      message: `${available} of ${desired} desired replicas are available.`,
      recommendation: 'Check the deployment rollout, pod status, scheduling events, and container image.'
    }]
  })
}

function detectWarningEventIssues(events: KubernetesEvent[], now: number): ClusterIssue[] {
  const issues = new Map<string, ClusterIssue>()

  for (const event of events) {
    if (event.type !== 'Warning') {
      continue
    }

    const timestamp = event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp
    const since = timestamp ? new Date(timestamp) : undefined
    if (!since || Number.isNaN(since.getTime()) || now - since.getTime() > RECENT_EVENT_WINDOW_MS) {
      continue
    }

    const kind = event.involvedObject?.kind || 'Resource'
    const name = event.involvedObject?.name || 'unknown'
    const namespace = event.involvedObject?.namespace
    const reason = event.reason || 'Warning'
    const id = `event/${namespace || 'cluster'}/${kind}/${name}/${reason}`
    const existing = issues.get(id)

    if (existing) {
      const count = Number(event.count || 1)
      const existingCount = Number(existing.message.match(/repeated (\d+) times/)?.[1] || 1)
      if (count <= existingCount) {
        continue
      }
    }

    issues.set(id, {
      id,
      severity: 'warning',
      title: `${kind}: ${reason}`,
      resourceKind: kind,
      resourceName: name,
      namespace,
      message: `${event.message || 'Kubernetes reported a warning event.'}${event.count && event.count > 1 ? ` (repeated ${event.count} times)` : ''}`,
      recommendation: 'Review the Kubernetes event details and the affected resource before taking action.',
      since: since.toISOString()
    })
  }

  return [...issues.values()]
}

export async function GET(request: NextRequest) {
  const checkedAt = new Date()
  const { kc, isAvailable } = getKubeConfig(request)

  if (DEMO_MODE || !isAvailable) {
    return NextResponse.json({
      mode: 'demo',
      checkedAt: checkedAt.toISOString(),
      alerts: [],
      message: 'Live issue checks require a connected Kubernetes cluster. Demo data is not monitored.'
    })
  }

  try {
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const appsApi = kc.makeApiClient(k8s.AppsV1Api)
    const [nodes, pods, deployments, events] = await Promise.all([
      coreApi.listNode(),
      coreApi.listPodForAllNamespaces(),
      appsApi.listDeploymentForAllNamespaces(),
      coreApi.listEventForAllNamespaces()
    ])

    const now = checkedAt.getTime()
    const alerts = [
      ...detectNodeIssues(nodes.items),
      ...detectDeploymentIssues(deployments.items),
      ...detectPodIssues(pods.items, now),
      ...detectWarningEventIssues(events.items, now)
    ].sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'critical' ? -1 : 1
      }
      return (b.since ? new Date(b.since).getTime() : 0) - (a.since ? new Date(a.since).getTime() : 0)
    })

    return NextResponse.json({
      mode: 'live',
      checkedAt: checkedAt.toISOString(),
      alerts
    })
  } catch (error) {
    console.error('Live issue checks failed:', error)
    return NextResponse.json(
      { error: 'Unable to check the cluster. Verify connectivity and read access to nodes, pods, deployments, and events.' },
      { status: 503 }
    )
  }
}
