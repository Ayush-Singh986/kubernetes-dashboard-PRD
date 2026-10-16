"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { ActivityFeed } from "@/components/activity-feed"
import { ClusterIssueMonitor } from "@/components/cluster-issue-monitor"
import { ResourceCharts } from "@/components/resource-charts"
import { QuickActions } from "@/components/quick-actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiClient, ClusterInfo, Pod, Node, Service } from "@/lib/api-client"
import { 
  Container, 
  Server,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  Network,
  RefreshCw,
  Layers
} from "lucide-react"

export default function Home() {
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
  const [pods, setPods] = useState<Pod[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const hasLoaded = useRef(false)

  const fetchData = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true)
      setRefreshing(true)
      const [info, podsData, nodesData, servicesData] = await Promise.all([
        apiClient.getClusterInfo(),
        apiClient.getPods(),
        apiClient.getNodes(),
        apiClient.getServices()
      ])
      
      setClusterInfo(info)
      setPods(podsData)
      setNodes(nodesData)
      setServices(servicesData)
      setError(null)
      setIsDemoMode(info.name === 'demo-cluster')
      setLastUpdated(new Date())
      hasLoaded.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cluster data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
    const interval = window.setInterval(fetchData, 15000)
    return () => window.clearInterval(interval)
  }, [fetchData])

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'ready':
        return (
          <Badge variant="success" className="text-xs gap-1 py-0.5">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {status}
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="warning" className="text-xs gap-1 py-0.5">
            <Clock className="size-3" />
            {status}
          </Badge>
        )
      case 'failed':
      case 'notready':
        return (
          <Badge variant="destructive" className="text-xs gap-1 py-0.5">
            <AlertTriangle className="size-3" />
            {status}
          </Badge>
        )
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>
    }
  }

  const runningPodsCount = pods.filter(p => p.status === 'Running').length
  const readyNodesCount = nodes.filter(n => n.status === 'Ready').length
  const summaryValue = (value: number) => error ? "—" : loading && !clusterInfo ? "…" : value
  const connectionLabel = error ? isDemoMode ? "Demo data unavailable" : "Cluster unavailable" : isDemoMode ? "Demo environment" : loading ? "Connecting to cluster" : "Cluster connected"

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6 pb-12">
          <section className="relative isolate overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-lg sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 size-80 rounded-full bg-sky-500/15 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-1/3 size-64 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="space-y-4">
                <Badge variant="outline" className="gap-2 border-white/15 bg-white/5 text-slate-200">
                  <span className={`size-2 rounded-full ${error ? "bg-rose-400" : isDemoMode ? "bg-sky-400" : loading ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} />
                  {connectionLabel}
                </Badge>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cluster overview</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                    A live view of your Kubernetes resources, workload health, and operational signals.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Server className="size-3.5" />
                    {clusterInfo?.name || (loading ? "Finding cluster…" : "No active cluster")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="size-3.5" />
                    {clusterInfo?.version || "Kubernetes version unavailable"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first sync"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchData()}
                  disabled={refreshing}
                  className="border-white/20 bg-white/5 text-white shadow-none hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className={`mr-2 size-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button asChild size="sm" className="bg-sky-400 text-slate-950 hover:bg-sky-300">
                  <Link href="/workloads">
                    Inspect workloads
                    <ArrowUpRight className="ml-1.5 size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Live cluster data is unavailable</p>
                <p className="mt-1 leading-relaxed">{error} Check your Kubernetes context and server connectivity, then refresh.</p>
              </div>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/nodes" aria-label="View cluster nodes" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card className="h-full border-border/70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-sky-500/40 group-hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Compute Nodes
                </CardTitle>
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500 border border-sky-500/20">
                  <Server className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold tracking-tight text-foreground font-mono">
                    {summaryValue(clusterInfo?.nodes ?? nodes.length)}
                  </div>
                  <Badge variant={error ? "secondary" : "success"} className="text-[10px] h-4.5 px-1.5 font-semibold">
                    {error ? "Unavailable" : `${readyNodesCount} Ready`}
                  </Badge>
                </div>
                <p className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Nodes in this cluster</span>
                  <ArrowUpRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </p>
              </CardContent>
            </Card>
            </Link>

            <Link href="/pods" aria-label="View cluster pods" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card className="h-full border-border/70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-emerald-500/40 group-hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Container Pods
                </CardTitle>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Container className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold tracking-tight text-foreground font-mono">
                    {summaryValue(clusterInfo?.pods ?? pods.length)}
                  </div>
                  <Badge variant={error ? "secondary" : "success"} className="text-[10px] h-4.5 px-1.5 font-semibold">
                    {error ? "Unavailable" : `${runningPodsCount} Running`}
                  </Badge>
                </div>
                <p className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Across all namespaces</span>
                  <ArrowUpRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </p>
              </CardContent>
            </Card>
            </Link>

            <Link href="/services" aria-label="View cluster services" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card className="h-full border-border/70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-violet-500/40 group-hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Network Services
                </CardTitle>
                <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500 border border-violet-500/20">
                  <Network className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold tracking-tight text-foreground font-mono">
                    {summaryValue(clusterInfo?.services ?? services.length)}
                  </div>
                  <Badge variant={error ? "secondary" : "purple"} className="text-[10px] h-4.5 px-1.5 font-semibold">
                    {error ? "Unavailable" : "Observed"}
                  </Badge>
                </div>
                <p className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Service discovery and routing</span>
                  <ArrowUpRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </p>
              </CardContent>
            </Card>
            </Link>

            <Link href="/namespaces" aria-label="View cluster namespaces" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card className="h-full border-border/70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-amber-500/40 group-hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Namespaces
                </CardTitle>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <Layers className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div className="text-3xl font-semibold tracking-tight text-foreground font-mono">
                    {summaryValue(clusterInfo?.namespaces ?? 0)}
                  </div>
                </div>
                <p className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Logical resource boundaries</span>
                  <ArrowUpRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </p>
              </CardContent>
            </Card>
            </Link>
          </div>

          {/* Quick Actions */}
          <QuickActions />

          {/* Resource Telemetry Charts */}
          <ResourceCharts />

          {/* Live health checks */}
          <ClusterIssueMonitor />

          {/* Recent Resources & Activity Stream */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Container className="size-4 text-primary" />
                    Active Pods
                  </CardTitle>
                  <CardDescription>Latest container runtime status and host nodes</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs">
                  <a href="/pods">View All <ArrowUpRight className="size-3.5 ml-1" /></a>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {pods.slice(0, 5).map((pod, idx) => (
                    <div
                      key={`${pod.namespace}-${pod.name}-${pod.node || idx}`}
                      className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-card/60 hover:bg-muted/40 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted text-foreground border border-border/50">
                          <Container className="size-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-foreground font-mono">{pod.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-mono">
                              {pod.namespace}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground font-mono">Node: {pod.node}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(pod.status)}
                        <span className="text-xs font-mono text-muted-foreground hidden sm:inline">{pod.ip}</span>
                      </div>
                    </div>
                  ))}
                  {!loading && pods.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center">
                      <Container className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-2 text-sm font-medium">
                        {error ? "Pod data is unavailable" : "No pods to show"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {error ? "Reconnect to a cluster to load live workloads." : "Pods will appear here when they are available."}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <ActivityFeed />
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}
