#!/bin/bash

BASE="http://localhost:8000"

# --- Colors ---
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BLUE="\033[0;34m"
RESET="\033[0m"

# Print heading
print_header() {
  echo -e "\n${BLUE}==> $1${RESET}"
}

# Perform a timed HTTP request and color output
# Arguments: METHOD URL JSON_PAYLOAD
test_endpoint() {
  local method=$1
  local url=$2
  local payload=$3

  # Capture status code and total time
  response=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" \
    -X "$method" "$url" \
    -H "Content-Type: application/json" \
    -d "$payload")

  status=$(echo "$response" | awk '{print $1}')
  time=$(echo "$response" | awk '{print $2}')

  # Pick color
  if [[ "$status" -ge 200 && "$status" -lt 300 ]]; then
    color=$GREEN
  elif [[ "$status" -ge 500 ]]; then
    color=$YELLOW   # expected for onion dataset
  else
    color=$RED
  fi

  echo -e " $color[$status]${RESET}  ${url}  (${time}s)"
}


echo -e "${BLUE}=============================="
echo " CRUNCH API TEST SCRIPT"
echo -e "==============================${RESET}"

print_header "Backend root"
curl -s "$BASE/" | jq .

print_header "Ping"
test_endpoint "GET" "$BASE/api/ping"

print_header "Sample listing"
for species in carrot onion; do
  test_endpoint "GET" "$BASE/api/data/$species/samples"
done

print_header "Find Genes"
for species in carrot onion; do
  test_endpoint "GET" \
    "$BASE/api/$species/find_genes?phenotype=test"
done

print_header "Similarity"
for species in carrot onion; do
  test_endpoint "POST" \
    "$BASE/api/$species/similarity" \
    '{"phenotype_blocks":[{"genes":["LOC135151205"]}],"reference_accession":"SRR20827052"}'
done

print_header "PCA / MDS"
for species in carrot onion; do
  test_endpoint "POST" \
    "$BASE/api/$species/pca_mds" \
    '{"phenotype_blocks":[{"genes":["LOC135151200"]}]}'
done

print_header "Heatmap clustering"
for species in carrot onion; do
  test_endpoint "POST" \
    "$BASE/api/$species/heatmap" \
    '{"phenotype_blocks":[{"genes":["LOC135151205"]}]}'
done

print_header "SNP / Gene Association"
for species in carrot onion; do
  test_endpoint "POST" \
    "$BASE/api/$species" \
    '{"metadata":{"SAMPLE1":1,"SAMPLE2":0},"phenotype_name":"test"}'
done

echo -e "${BLUE}=============================="
echo " DONE — All endpoints tested"
echo -e "==============================${RESET}"

