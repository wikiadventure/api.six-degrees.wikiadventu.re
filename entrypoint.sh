cd /build/ &&
# Run the build rust binary to create graph.rkyv
/build/rust-graph-builder &&
mv graph.rkyv /prod/ &&
cd /prod &&
echo $DOCKER_TOKEN | docker login -u $DOCKER_USERNAME --password-stdin &&
docker build -f dockerfile.graph-builder -t sacramentix1225/${WIKI_LANG}wiki-rust-graph .
docker push sacramentix1225/${WIKI_LANG}wiki-rust-graph &&
echo finished

