import { NextRequest, NextResponse } from 'next/server'
import * as k8s from '@kubernetes/client-node'
import { k8sStore } from '@/lib/k8s-store'
import { getKubeConfig } from '@/lib/k8s-client'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET(request: NextRequest) {
  const { kc, isAvailable, currentContext } = getKubeConfig(request)

  if (DEMO_MODE || !isAvailable) {
    const info = k8sStore.getClusterInfo()
    if (currentContext) {
      info.name = currentContext
    }
    return NextResponse.json(info)
  }

  try {
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const versionApi = kc.makeApiClient(k8s.VersionApi)

    const [versionRes, nodesRes, podsRes, svcRes, nsRes] = await Promise.all([
      versionApi.getCode(),
      coreApi.listNode(),
      coreApi.listPodForAllNamespaces(),
      coreApi.listServiceForAllNamespaces(),
      coreApi.listNamespace()
    ])

    const version = `v${versionRes.major}.${versionRes.minor}`
    const clusterName = kc.getCurrentCluster()?.name || kc.getCurrentContext() || 'Current cluster'

    return NextResponse.json({
      name: clusterName,
      version,
      nodes: nodesRes.items.length,
      pods: podsRes.items.length,
      services: svcRes.items.length,
      namespaces: nsRes.items.length
    })
  } catch (error) {
    console.error('Error fetching live cluster info:', error)
    return NextResponse.json(
      { error: 'Unable to fetch live cluster information. Verify cluster connectivity and read permissions.' },
      { status: 503 }
    )
  }
}
