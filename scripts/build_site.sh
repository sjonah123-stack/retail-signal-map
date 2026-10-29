#!/usr/bin/env bash
# Copies the site into _site/ for GitHub Pages and stamps asset URLs with the commit.
#
# Pages lets browsers cache files for 10 minutes, so after a deploy a returning visitor could pair the new
# index.html with yesterday's app.js. Stamping app.js, app.css and the preloaded data file with ?v=<commit>
# makes a new page fetch matching files; app.js reads the stamp off its own URL and adds it to data requests.
set -euo pipefail
cd "$(dirname "$0")/.."

version="$(git rev-parse --short=12 HEAD)"
rm -rf _site
mkdir _site
cp -r index.html assets data _site/

sed -i.bak \
  -e "s#\"assets/app\.css\"#\"assets/app.css?v=${version}\"#" \
  -e "s#\"assets/app\.js\"#\"assets/app.js?v=${version}\"#" \
  -e "s#\"data/stores\.json\"#\"data/stores.json?v=${version}\"#" \
  _site/index.html
rm _site/index.html.bak

for asset in "assets/app.css" "assets/app.js" "data/stores.json"; do
  grep -q "\"${asset}?v=${version}\"" _site/index.html || { echo "Didn't stamp ${asset} in index.html" >&2; exit 1; }
done
echo "Built _site at ${version}"
