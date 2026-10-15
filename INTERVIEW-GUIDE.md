# Kubernetes Dashboard: Simple Project and Interview Guide

This guide explains what the project does, how a request moves through it, and how to describe it clearly in an interview.

## 1. The project in one sentence

This is a web dashboard for viewing Kubernetes cluster resources and performing selected operations, such as checking pods, inspecting workloads, and scaling or restarting resources.

Kubernetes is a system for running and managing containerized applications. A cluster contains worker machines called **nodes**; applications run in **pods**; and resources such as Deployments, Services, and ConfigMaps describe how those applications should run and communicate.

## 2. A short interview introduction

> "I built a Kubernetes dashboard using Next.js, React, and TypeScript. It provides pages for cluster resources such as pods, deployments, nodes, services, storage, and autoscaling. The browser calls API route handlers in the same Next.js application. Those handlers can use the Kubernetes JavaScript client with the server's kubeconfig, while demo data lets the interface run without a cluster. The project also includes Docker and Kubernetes deployment files. Some areas are still prototype-level, so I distinguish the real Kubernetes integrations from simulated features."

Use this as a starting point and adjust it to match the parts you personally worked on.

## 3. What problem does it solve?

Cluster information and common operations are usually spread across terminal commands and different tools. This dashboard brings many of those views into one interface:

- See cluster health and browse pods, Deployments, StatefulSets, DaemonSets, Jobs, and CronJobs.
- Inspect Services, Ingresses, Gateway API resources, namespaces, configuration, and storage.
- View pod logs and use the pod terminal/exec interface.
- View autoscaling, monitoring, AI/GPU, Helm, security, and topology pages.
- Perform selected actions such as scaling, restarting, deleting, or cordoning resources.

The interface is intended to make cluster operations easier to see and demonstrate. It is not, by itself, a replacement for Kubernetes RBAC or a production identity provider.

## 4. How it works, from opening the site to seeing cluster data

1. **The browser opens a page.** The pages live in `src/app`, following the Next.js App Router. For example, `src/app/pods/page.tsx` provides the Pods screen.
2. **The shared app shell loads.** `src/app/layout.tsx` sets up shared providers for authentication state, language, tooltips, and notifications. Most dashboard screens use `DashboardLayout` and `ProtectedRoute`.
3. **The screen requests data.** UI components call methods in `src/lib/api-client.ts`. For example, `getPods()` requests `/api/pods`.
4. **A Next.js route handles the request.** The matching handler lives under `src/app/api`, such as `src/app/api/pods/route.ts`. It can read query parameters like a namespace and returns JSON.
5. **The handler chooses a data source.** In demo mode, or when a kubeconfig is unavailable, supported routes use the in-memory `k8sStore` and its sample data. For real-cluster routes, the server uses `@kubernetes/client-node` and the kubeconfig available to the server process. A selected context can be passed using a request header or cookie.
6. **The page renders the result.** React stores the returned data in component state and displays it in cards, tables, charts, dialogs, and status badges. Some actions send POST requests to API handlers and then refresh or update the screen.

In short:

```text
Browser page -> API client -> Next.js API route -> Kubernetes API or demo store
             <- JSON response <- mapped resource data <-
```

The API route handlers keep Kubernetes access on the server side rather than having browser components connect directly to the cluster.

## 5. Main folders and files

| Location | What it contains |
| --- | --- |
| `src/app` | App Router pages and API route handlers. `src/app/api` is the server-side API; the other folders provide dashboard pages. |
| `src/components` | Shared dashboard components, dialogs, charts, search, terminal, and reusable UI elements. |
| `src/contexts` | Shared client-side state for authentication, language, and toast notifications. |
| `src/hooks` | Reusable React hooks, including hooks for refreshing or receiving resource data. |
| `src/lib/api-client.ts` | Typed browser-side methods for calling this app's API routes. |
| `src/lib/k8s-client.ts` | Loads kubeconfig, lists contexts, and selects the requested cluster context. |
| `src/lib/k8s-store.ts` | In-memory sample data and simulated operations used by demo/fallback paths. |
| `src/lib/demo-data.ts` | Generators for example cluster resources. |
| `src/lib/metrics-client.ts`, `src/lib/websocket-server.ts` | Metrics and event streaming-related code. Treat this as a separate/in-progress integration rather than assuming it is the primary data path for every page. |
| `public` | Static images and the Kubernetes icon. |
| `k8s` | Kubernetes Deployment, Service, and RBAC manifests for running the dashboard in a cluster. |
| `.github/workflows` | CI, Docker image publishing, manifest validation, and security scanning workflows. |
| `Dockerfile`, `docker-compose.yml` | Container build and local container startup configuration. |
| `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Dependencies, scripts, and framework/type/lint configuration. |

### Main page areas

- **Cluster resources:** overview, workloads, autoscaling, pods, deployments, services, gateways, custom resources, configuration, storage, Helm, nodes, and namespaces.
- **Operations and telemetry:** AI/GPU workloads, security, topology, terminal, monitoring, and settings.
- **API routes:** matching handlers for cluster details, resource lists, logs, actions, contexts, and other dashboard data.

## 6. Important technical choices

- **Next.js App Router:** UI pages and server API routes live in one application, so a separate backend service is not needed for the basic request flow.
- **React and TypeScript:** pages are built from components, and shared interfaces describe many resource and API response shapes.
- **Kubernetes JavaScript client:** selected server-side API routes use `@kubernetes/client-node` to talk to the Kubernetes API.
- **Demo store:** the in-memory `k8sStore` lets people explore and demonstrate the UI without connecting to a cluster. It is not a database; its data is not durable and can reset when the server restarts.
- **UI libraries:** Tailwind CSS, shadcn-style/Radix UI components, Lucide icons, Recharts, and xterm.js support the interface, charts, and terminal view.
- **Container deployment:** the Dockerfile builds a standalone Next.js application and runs it as a non-root user. Kubernetes manifests include probes and resource requests/limits.

## 7. Running the project

You need Node.js and npm. From the project directory:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The sign-in screen provides demo credentials: `admin@k8s.local` / `admin123`. In demo mode, the UI uses simulated data.

Useful project checks:

```bash
npm run type-check
npm run lint
npm run build
```

The repository also includes Docker Compose configuration and Kubernetes manifests under `k8s`. To use a real cluster, the server process must have access to a valid kubeconfig or run with appropriate in-cluster credentials and RBAC permissions.

## 8. Be accurate about the current prototype

These details matter in a technical interview:

- **Not every screen is backed by a live Kubernetes API call.** Several API handlers use the in-memory store, and some features are simulations. Check the relevant handler before describing an operation as a real cluster operation.
- **The demo store is not persistent.** It does not replace Kubernetes or a database, and simulated changes can disappear when the process restarts.
- **The sign-in is for demonstration.** The UI checks demo credentials and stores client-side state; it is not production authentication. Protecting a page in the browser does not secure API routes.
- **The security report and some specialist views are prototype features.** Do not describe them as a complete CIS audit or production security scanner unless those integrations have been implemented.
- **Cluster permissions are important.** The app needs credentials with suitable access. For real use, the sample RBAC should be reviewed and restricted to the minimum permissions required.

A good interview answer is clear about what works against a real cluster, what is demo-only, and what you would improve next.

## 9. Common interview questions

### How does the UI get Kubernetes data?

The page calls a typed method in `api-client.ts`. That method sends a request to a Next.js API route. The route either reads sample data from `k8sStore` or uses `@kubernetes/client-node` and the server's kubeconfig, then returns JSON for the page to render.

### Why have both live data and demo data?

Demo data makes it possible to explore and present the UI without requiring a cluster. The same API response shape can be used by the frontend, while a route decides whether it has a live cluster to query.

### How is cluster access configured?

The server loads kubeconfig using the Kubernetes client library. The context endpoint lists available contexts, and the selected context is sent with requests and applied on the server. In a Kubernetes deployment, credentials and permissions must instead be configured appropriately for that environment.

### Is the sign-in production-ready?

No. It is a frontend demo flow. Production use would require server-validated identity, secure session handling, authorization on every API route, and careful integration with Kubernetes RBAC.

### What would you improve next?

I would first make real-vs-simulated behavior explicit in the UI and complete the live integrations route by route. Then I would add server-side authentication and authorization, validate every mutation, use least-privilege RBAC, and add automated tests for the API handlers and resource mapping.

## 10. A simple closing summary

> "The project is a Kubernetes operations dashboard built as a Next.js application. The browser talks to typed API routes, and those routes provide either sample data or data from selected Kubernetes APIs. The app has a broad set of resource screens and Docker/Kubernetes deployment files. Its key engineering areas are the UI-to-API data flow, mapping Kubernetes objects into frontend-friendly data, context selection, and clearly separating demo behavior from real cluster access."
