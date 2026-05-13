import { $ } from "bun";

// Configuration
const LANGUAGES = ["oc", "eo"]; // Add or remove target languages as needed
const DOCKER_IMAGE_PREFIX = "sacramentix1225/six-degrees-api"; // Replace with your actual Docker Hub namespace

/**
 * Step 0: Build the Data Processor upfront
 */
async function buildDataProcessor() {
  console.log("Building data processor (rust-graph-builder)...");
  await $`cd .. && cargo build --release --manifest-path=rust-graph-builder/Cargo.toml`;
}

/**
 * Step 0.5: Login to Docker Hub
 */
async function loginToDocker() {
  const user = process.env.DOCKER_USERNAME;
  const pat = process.env.DOCKER_PAT;
  
  if (!user || !pat) {
    console.warn("DOCKER_USERNAME or DOCKER_PAT not set in environment. Skipping docker login...");
    return;
  }
  
  console.log(`[Docker] Logging into Docker Hub as ${user}...`);
  // Using shell piping to securely pass the password via stdin
  await $`echo ${pat} | docker login --username ${user} --password-stdin`;
}

/**
 * Step 1: Run the Data Processor to generate graph.rkyv for a given language
 */
async function generateGraph(lang: string) {
  console.log(`[${lang}] Running data processor (rust-graph-builder)...`);
  // Using WIKI_LANG or CLI args depending on your rust implementation.
  // We navigate to the parent repository root to execute the compiled binary.
  await $`cd .. && WIKI_LANG=${lang} ./rust-graph-builder/target/release/rust-graph-builder`;
}

/**
 * Step 2: Build the Serverless API Docker Images (Generic and Hardware-Optimized)
 */
async function buildAndPushDockerImages(lang: string) {
  console.log(`[${lang}] Preparing Docker environment...`);
  
  // Link the giant graph memory so Docker can pick it up
  await $`cd .. && ln -f graphs/${lang}graph.rkyv graph.rkyv`;

  const genericTag = `${DOCKER_IMAGE_PREFIX}-${lang}:latest`;
  const localOptimizedTag = `${DOCKER_IMAGE_PREFIX}-${lang}:local-optimized`;
  
  // 1. Build & Push Generic Image (No specific CPU constraints)
  console.log(`[${lang}] Building GENERIC image for Docker Hub...`);
  await $`cd .. && docker build -f dockerfile.graph-api -t ${genericTag} --build-arg WIKI_LANG=${lang} --build-arg CUSTOM_RUSTFLAGS="" .`;
  console.log(`[${lang}] Pushing GENERIC image to registry...`);
  await $`docker push ${genericTag}`;
  console.log(`[${lang}] Removing GENERIC image locally to save disk space...`);
  await $`docker rmi ${genericTag}`;

  // 2. Build Hardware Optimized Image (Don't push, keep local)
  console.log(`[${lang}] Building OPTIMIZED image for Hetzner server...`);
  const optFlags = process.env.OPTIMIZED_RUSTFLAGS || "-C target-cpu=znver2";
  await $`cd .. && docker build -f dockerfile.graph-api -t ${localOptimizedTag} --build-arg WIKI_LANG=${lang} --build-arg CUSTOM_RUSTFLAGS=${optFlags} .`;

  // Cleanup the hard link
  await $`cd .. && rm graph.rkyv`;
}

/**
 * Generate a complete docker-compose.yml from the base and the target languages
 */
async function generateDockerCompose() {
  console.log("Generating docker-compose.yml from base...");
  const baseContent = await Bun.file("docker-compose.base.yml").text();
  
  let composeContent = baseContent;
  
  for (const lang of LANGUAGES) {
    const serviceName = `api-${lang}`;
    // We explicitly instruct Docker Compose to use the optimized local tag
    const imageTag = `${DOCKER_IMAGE_PREFIX}-${lang}:local-optimized`;
    // Traefik dynamically routes via host: lang.six-degrees.wikiadventu.re
    const traefikRule = `Host(\`${lang}.six-degrees.wikiadventu.re\`)`;
    
    composeContent += `
  ${serviceName}:
    image: "${imageTag}"
    container_name: "${serviceName}"
    restart: unless-stopped
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${serviceName}.rule=${traefikRule}"
      - "traefik.http.routers.${serviceName}.entrypoints=websecure"
      - "traefik.http.routers.${serviceName}.tls.certresolver=myresolver"
      # Assuming your API runs on port 8080 internally, adjust if different
      - "traefik.http.services.${serviceName}.loadbalancer.server.port=8080"
`;
  }
  
  await Bun.write("docker-compose.yml", composeContent);
  console.log("docker-compose.yml generated successfully.");
}

/**
 * Step 4: Deploy and perform zero-downtime swap using Traefik & Docker Compose
 */
async function deployServices(lang: string) {
  const serviceName = `api-${lang}`;
  console.log(`[Deploy] Updating container for ${serviceName} with local optimized image...`);
  // Note: We deliberately SKIP 'docker compose pull' so it doesn't overwrite our local-optimized image
  await $`docker compose up -d ${serviceName}`;
  
  // Clean up dangling images to save disk space on Hetzner
  await $`docker image prune -f`;
}

/**
 * Main Orchestrator Pipeline
 * Runs sequentially to avoid CPU/RAM bottlenecking on the host machine.
 */
async function runPipeline() {
  console.log("=== Starting Six Degrees of Wikipedia Pipeline ===");

  try {
    await loginToDocker();
    await buildDataProcessor();
  } catch (error) {
    console.error("[ERROR] Failed to build the data processor:", error);
    process.exit(1);
  }

  // Generate the composite docker-compose.yml based on current LANGUAGES
  try {
    await generateDockerCompose();
  } catch (error) {
    console.error("[ERROR] Failed to generate docker-compose.yml:", error);
    process.exit(1);
  }

  for (const lang of LANGUAGES) {
    console.log(`\n--- Processing Language: ${lang.toUpperCase()} ---`);
    try {
      await generateGraph(lang);
      await buildAndPushDockerImages(lang);
      await deployServices(lang);
      console.log(`--- Finished Processing: ${lang.toUpperCase()} ---`);
    } catch (error) {
      console.error(`[ERROR] Pipeline failed for language ${lang}:`, error);
      // Exit explicitly so cron/systemd registers the failure
      process.exit(1);
    }
  }
}

// Execute
runPipeline();