# Deployment Guide

This guide uses Windows PowerShell commands. Run each command from the project folder unless the step says otherwise. Each command is in its own code block so it can be copied and run individually.

## Before deploying

Install Node.js 20 or newer, Git, Docker Desktop with Docker Compose, and `kubectl`. For a Kubernetes deployment, also have a reachable Kubernetes cluster and a kubeconfig configured for an account allowed to deploy the dashboard. Confirm the active context before running any command that changes a cluster.

The Compose configuration deliberately sets `NEXT_PUBLIC_DEMO_MODE=true`, so Compose is for previewing the dashboard with sample data. The Kubernetes manifests use a ServiceAccount to connect the deployed dashboard to a cluster. The included RBAC manifest grants broad cluster permissions, including access to Secrets and resource mutation; it should be reduced to the permissions the organization actually requires before a production deployment. The browser sign-in is demo-only, and the manifests do not configure production user authentication or TLS. Do not expose this dashboard publicly until those controls are supplied and reviewed.

The dashboard's Live Issue Monitor polls cluster pods, nodes, Deployments, and recent Warning events every 15 seconds. It identifies common health signals (such as NotReady nodes, unavailable replicas, failed or restarting pods, and recent warning events) and suggests investigation steps; it does not diagnose every application failure or automatically remediate resources. It does not send Slack or email notifications, and CPU/memory saturation detection is not implemented. Live checks need read access to pods, nodes, Deployments, and events. Demo mode does not monitor a real cluster. The Resource Allocation chart is illustrative sample data, not a live measurement. Live-cluster checks have not yet been validated against a real cluster in this project environment.

The Kubernetes manifest initially refers to `kubernetes-dashboard:latest`, an image name intended for a local build. The Kubernetes deployment instructions below replace it with the image you build and push to your own image registry.

## Run and validate the project locally

Change to the project folder:

```powershell
Set-Location "D:\kubernetes-dashboard-master\kubernetes-dashboard-master"
```

Install the exact dependencies recorded in the lock file:

```powershell
npm ci
```

Check TypeScript:

```powershell
npm run type-check
```

Run ESLint:

```powershell
npm run lint
```

Build the production application:

```powershell
npm run build
```

Start the development server:

```powershell
npm run dev
```

Open `http://localhost:3000` in a browser. The development server connects to a Kubernetes cluster only if the Node.js process can read a kubeconfig and demo mode is not enabled. Otherwise, API routes may return the project's demo or fallback data. Stop the development server by pressing `Ctrl+C` in the terminal where it is running.

## Preview with Docker Compose

Start Docker Desktop and make sure its engine is running. From the project folder, build and start the Compose service:

```powershell
docker compose up --build -d
```

Check that the container is running:

```powershell
docker compose ps
```

Check the dashboard health endpoint:

```powershell
curl.exe -i http://localhost:3000/api/cluster
```

Open `http://localhost:3000` in a browser. Compose enables demo mode, so this is a sample-data preview rather than a live connection to a production cluster.

Stop the Compose service when finished:

```powershell
docker compose down
```

## Build and publish an image for Kubernetes

Choose an image name in a registry your Kubernetes cluster can pull from. The following examples use Docker Hub; replace the username with your own Docker Hub account and choose a version tag. Do not assume that a previously mentioned account or image name exists or that you have permission to publish to it.

Set your Docker Hub username for the commands in this PowerShell session:

```powershell
$env:DOCKERHUB_USERNAME = "your-dockerhub-username"
```

Set a release tag:

```powershell
$env:IMAGE_TAG = "1.0.0"
```

Log in to Docker Hub. Docker will prompt for credentials; use a Docker Hub access token rather than putting a password in a command:

```powershell
docker login
```

Build the image from the project Dockerfile:

```powershell
docker build -t "${env:DOCKERHUB_USERNAME}/kubernetes-dashboard:${env:IMAGE_TAG}" .
```

Push the image to Docker Hub:

```powershell
docker push "${env:DOCKERHUB_USERNAME}/kubernetes-dashboard:${env:IMAGE_TAG}"
```

If the image repository is private, create an image-pull Secret in the target namespace and reference it from the Deployment's `imagePullSecrets` before deploying. Do not store registry credentials in the repository.

## Deploy to a Kubernetes cluster

Confirm that `kubectl` is connected to the intended cluster before continuing:

```powershell
kubectl config current-context
```

Check that the cluster is reachable:

```powershell
kubectl cluster-info
```

Inspect the cluster nodes:

```powershell
kubectl get nodes
```

Create the Gemini API Secret only if you want to enable the chat assistant. Set the key in your current PowerShell session using a secure method before running the next command. Do not commit it or put it in a `NEXT_PUBLIC_` variable:

```powershell
kubectl create secret generic kubernetes-dashboard-secrets --from-literal="GEMINI_API_KEY=$env:GEMINI_API_KEY" --dry-run=client -o yaml | kubectl apply -f -
```

The deployment references this Secret optionally. If the Secret is absent, the dashboard can still run, but chat requests return a not-configured message.

Apply the ServiceAccount and RBAC resources:

```powershell
kubectl apply -f k8s/rbac.yaml
```

Apply the Deployment and Services:

```powershell
kubectl apply -f k8s/deployment.yaml
```

Set the Deployment to use the image you built and pushed:

```powershell
kubectl set image deployment/kubernetes-dashboard kubernetes-dashboard="${env:DOCKERHUB_USERNAME}/kubernetes-dashboard:${env:IMAGE_TAG}"
```

Wait for the rollout to complete:

```powershell
kubectl rollout status deployment/kubernetes-dashboard
```

Check the dashboard pods:

```powershell
kubectl get pods -l app=kubernetes-dashboard
```

Check the Services:

```powershell
kubectl get services
```

To access the dashboard temporarily from your own computer, forward a local port to its ClusterIP Service:

```powershell
kubectl port-forward service/kubernetes-dashboard-service 3000:80
```

Keep port forwarding running and open `http://localhost:3000`. Press `Ctrl+C` in the port-forward terminal to stop the forwarding. This approach is preferable to exposing an unauthenticated demo login to the public internet, but it does not replace production authentication, authorization, or TLS.

## Verify and troubleshoot

Inspect the Deployment status:

```powershell
kubectl describe deployment kubernetes-dashboard
```

Read the application logs:

```powershell
kubectl logs deployment/kubernetes-dashboard
```

Check that the API responds through the port-forward:

```powershell
curl.exe -i http://localhost:3000/api/cluster
```

If pods show `ImagePullBackOff`, check that the image name and tag are correct, that the image exists in the registry, and that the cluster can pull it. For a private repository, configure an image-pull Secret. If the dashboard displays sample data, check whether demo mode is enabled, whether the pod has a usable Kubernetes service account, whether the RBAC permissions are sufficient, and whether the API route fell back after a Kubernetes API error. Do not treat the cluster overview's CPU and memory percentages as live measurements until the hardcoded values in the cluster API route have been replaced with a real metrics source.

## Remove the Kubernetes deployment

This removes the resources created by the deployment and RBAC manifests from the current `kubectl` context. Confirm the context before running these commands:

```powershell
kubectl config current-context
```

Delete the Deployment and Services:

```powershell
kubectl delete -f k8s/deployment.yaml
```

Delete the ServiceAccount and RBAC resources:

```powershell
kubectl delete -f k8s/rbac.yaml
```

If you created the optional Gemini Secret for this deployment, delete it separately:

```powershell
kubectl delete secret kubernetes-dashboard-secrets
```
