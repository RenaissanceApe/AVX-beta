#!/usr/bin/env bash
# Downloads the manufacturers' documents that build.py reads, into the folder given (not into
# the repository: the PDFs are the manufacturers' and stay with them).
#   scripts/truss-data/fetch.sh /tmp/truss && python3 scripts/truss-data/build.py /tmp/truss src/data/truss
set -euo pipefail
out="${1:?folder to download into}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out/pro" "$out/pro_pds" "$out/gt" "$out/pdf"
while IFS='|' read -r name url; do
  case "$name" in
    PDS-*) curl -sSL --fail "$url" -o "$out/pro_pds/${name#PDS-}.pdf" ;;
    *) curl -sSL --fail "$url" -o "$out/pro/$name.pdf" ;;
  esac
done < "$here/prolyte-sources.txt"
curl -sSL --fail https://globaltruss.de/marketing/files/website/GT-Trussing-2023.pdf -o "$out/gt/GT-Trussing-2023.pdf"
fantek=https://media.equipson.es/Docs
for f in "Manuales/Manual EC-30_2024 1_20240621133912.pdf" "Manuales/Manual EC-29p_2024 2_20240621133833.pdf" \
         "Manuales/Manual EC-76_2024_6a 1_20240621112532.pdf" "Datasheet/Datos tecnicos EC 40 FK40Q 1_20240228161825.pdf"; do
  curl -sSL --fail "$fantek/${f// /%20}" -o "$out/pdf/fantek_$(basename "$f" | tr ' ' '_')"
done
echo "Downloaded to $out"
