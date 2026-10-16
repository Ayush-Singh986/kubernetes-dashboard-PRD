"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldAlert } from "lucide-react"
import { apiClient, type IssueSnapshot } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const REFRESH_INTERVAL_MS = 15_000

export function ClusterIssueMonitor() {
  const [snapshot, setSnapshot] = useState<IssueSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await apiClient.getClusterIssues()
      setSnapshot(nextSnapshot)
      setError(null)
    } catch (refreshError) {
      setSnapshot(null)
      setError(refreshError instanceof Error ? refreshError.message : "Unable to check the cluster.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  const criticalCount = snapshot?.alerts.filter(alert => alert.severity === "critical").length || 0
  const warningCount = snapshot?.alerts.filter(alert => alert.severity === "warning").length || 0

  return (
    <Card id="live-issue-monitor" className="scroll-mt-20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-primary" />
            Live Issue Monitor
          </CardTitle>
          <CardDescription>
            Checks Kubernetes health signals every 15 seconds; it recommends actions but does not change resources.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh cluster issue checks"
          className="size-8 shrink-0 rounded-lg"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Live checks unavailable</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        ) : snapshot?.mode === "demo" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <Badge variant="warning">Demo mode</Badge>
            <p className="mt-2 text-muted-foreground">{snapshot.message}</p>
          </div>
        ) : snapshot ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={criticalCount ? "destructive" : "success"}>
                  {criticalCount} critical
                </Badge>
                <Badge variant={warningCount ? "warning" : "secondary"}>
                  {warningCount} warnings
                </Badge>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                Checked {new Date(snapshot.checkedAt).toLocaleTimeString()}
              </span>
            </div>

            {snapshot.alerts.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-semibold text-foreground">No issues detected by these checks</p>
                  <p className="mt-1 text-muted-foreground">This is not a guarantee that every application or cluster component is healthy.</p>
                </div>
              </div>
            ) : (
              <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                {snapshot.alerts.map(alert => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
                    <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${alert.severity === "critical" ? "text-destructive" : "text-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">{alert.title}</p>
                        <Badge variant="outline" className="h-4.5 px-1.5 font-mono text-[10px]">
                          {alert.resourceKind}{alert.namespace ? ` · ${alert.namespace}` : ""}
                        </Badge>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">{alert.resourceName}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                      <p className="mt-1.5 text-xs">
                        <span className="font-semibold">Suggested next step: </span>
                        <span className="text-muted-foreground">{alert.recommendation}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Checking cluster health…</p>
        )}
      </CardContent>
    </Card>
  )
}
