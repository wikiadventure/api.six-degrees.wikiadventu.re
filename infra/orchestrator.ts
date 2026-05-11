import { $ } from "bun";

// Configuration
const LANGUAGES = ["oc", "eo"]; // Add or remove target languages as needed
const DOCKER_IMAGE_PREFIX = "sacramentix1225/six-degrees-api"; // Replace with your actual Docker Hub namespace

/**
 * Step 0: Build the Data Processor upfront
 */
async function buildDataProcessor() {
  console.log("Building data processor (sql-dump-to-rust)...");
  await $`cd .. && cargo build --release --manifest-path=sql-dump-to-rust/Cargo.toml`;
}

/**
 * Step 1: Run the Data Processor to generate graph.rkyv for a given language
 */
async function generateGraph(lang: string) {
  console.log(`[${lang}] Running data processor (sql-dump-to-rust)...`);
  // Using WIKI_LANG or CLI args depending on your rust implementation.
  // We navigate to the parent repository root to execute the compiled binary.
  await $`cd .. && WIKI_LANG=${lang} ./sql-dump-to-rust/target/release/sql-dump-to-rust`;
}

/**
 * Step 2: Build the Serverless API Docker Image
 */
async function buildDockerImage(lang: string): Promise<string> {
  console.log(`[${lang}] Building rust-serverless Docker image...`);
  const imageTag = `${DOCKER_IMAGE_PREFIX}-${lang}:latest`;
  
  // Assuming the build context needs to be the root to access rust-serverless and graph.rkyv
  await $`cd .. && docker build -f dockerfile.serverless -t ${imageTag} --build-arg WIKI_LANG=${lang} .`;
  return imageTag;
}

/**
 * Step 3: Push the Docker image to Docker Hub
 */
async function pushDockerImage(imageTag: string) {
  console.log(`[${imageTag}] Pushing image to registry...`);
  await $`docker push ${imageTag}`;
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
    const imageTag = `${DOCKER_IMAGE_PREFIX}-${lang}:latest`;
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
  console.log(`[Deploy] Pulling latest image and updating container for ${serviceName}...`);
  // Target only the specific service in docker-compose
  await $`docker compose pull ${serviceName}`;
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
      const imageTag = await buildDockerImage(lang);
      await pushDockerImage(imageTag);
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