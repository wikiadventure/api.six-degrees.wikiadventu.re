import { $ } from "bun";
import { rm, link } from "node:fs/promises";
import { join } from "node:path";

const LANGUAGES = ["oc", "eo", "it", "de", "fr", "en"] as const;

if (!process.env.DOCKER_USERNAME) {
  console.error("FATAL: DOCKER_USERNAME environment variable is required.");
  process.exit(1);
}
const DOCKER_IMAGE_PREFIX = `${process.env.DOCKER_USERNAME}/six-degrees-api`;

async function rebuildDockerImages() {
  const commitHash = (await $`git rev-parse --short HEAD`.text()).trim();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // e.g. 20260513 for tag fallback

  console.log(`Rebuilding images on commit: ${commitHash}`);

  for (const lang of LANGUAGES) {
    console.log(`\n========================================`);
    console.log(`[${lang}] Processing...`);

    const sourceImage = `${DOCKER_IMAGE_PREFIX}-${lang}:latest`;
    const containerName = `extract_graph_${lang}_${Date.now()}`;
    const workspaceGraphPath = join("..", "graph.rkyv");

    try {
      console.log(`[${lang}] Creating temporary container from ${sourceImage}...`);
      // Create a temporary container to extract the file
      await $`docker create --name ${containerName} ${sourceImage}`;

      console.log(`[${lang}] Extracting graph.rkyv...`);
      // Clean up any existing file at the root before copying
      await rm(workspaceGraphPath, { force: true });
      await $`docker cp ${containerName}:/app/graph.rkyv ${workspaceGraphPath}`;

    } catch (e) {
      console.error(`[${lang}] Failed to extract graph.rkyv. Skipping...`, e);
      await $`docker rm -f ${containerName}`.quiet().catch(() => {});
      continue;
    } finally {
      // Always cleanup the temporary container
      await $`docker rm -f ${containerName}`.quiet().catch(() => {});
    }

    try {
      const genericTag = `${DOCKER_IMAGE_PREFIX}-${lang}:${date}-${commitHash}`;
      const dateTag = `${DOCKER_IMAGE_PREFIX}-${lang}:${date}`;
      const latestTag = `${DOCKER_IMAGE_PREFIX}-${lang}:latest`;
      const localOptimizedTag = `${DOCKER_IMAGE_PREFIX}-${lang}:local-optimized`;

      console.log(`[${lang}] Rebuilding GENERIC image on current commit...`);
      await $`cd .. && docker build -f dockerfile.graph-api -t ${genericTag} -t ${dateTag} -t ${latestTag} --build-arg WIKI_LANG=${lang} --build-arg CUSTOM_RUSTFLAGS="" .`;
      
      console.log(`[${lang}] Rebuilding OPTIMIZED image...`);
      const optFlags = process.env.OPTIMIZED_RUSTFLAGS || "-C target-cpu=znver2 -C target-feature=+aes,+avx2,+bmi1,+bmi2";
      await $`cd .. && docker build -f dockerfile.graph-api -t ${localOptimizedTag} --build-arg WIKI_LANG=${lang} --build-arg CUSTOM_RUSTFLAGS=${optFlags} .`;

      // Optional: push to registry
      // console.log(`[${lang}] Pushing images...`);
      // await $`docker push ${genericTag} && docker push ${dateTag} && docker push ${latestTag}`;

      console.log(`[${lang}] Cleaning up dangling and old images...`);
      // Remove the old source image (if it's not the newly tagged latest)
      // Docker will just untag or we can use docker image prune to clean up dangling layers
      await $`docker image prune -f --filter "label=org.opencontainers.image.title=six-degrees-api"`; 
      // Safe cleanup of the old dangling images built from previous commits
      await $`docker image prune -f`;

      console.log(`[${lang}] Successfully rebuilt!`);
    } catch(e) {
       console.error(`[${lang}] Failed to build or clean up.`, e);
    } finally {
      // Cleanup the extracted graph.rkyv file so it doesn't stay in the repo root
      await rm(workspaceGraphPath, { force: true });
    }
  }

  console.log("\nAll languages processed!");
}

rebuildDockerImages().catch(console.error);
