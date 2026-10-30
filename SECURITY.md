# Security

Retail Signal is a static site: no server, accounts, cookies or analytics. Deal lists people upload stay in their own browser.

## Reporting a problem

Please report security issues privately through GitHub: on this repository, open **Security → Report a vulnerability**. Don't open a public issue. You'll get a reply within a few days.

## What's in place

- A Content Security Policy limits the page to this site, the Leaflet CDN (with Subresource Integrity), Esri map tiles, OpenStreetMap's geocoder and Overpass API, and the FOSSGIS Valhalla server for drive-time areas.
- Everything read from links, opened files and uploaded deal lists is validated: coordinates must fall in the US, colors must be hex values, and text is escaped before it reaches the page.
- CSV exports prefix cells that start with `=`, `+`, `-` or `@` so spreadsheets don't run them as formulas.
- GitHub Actions are pinned to exact commits, each job gets only the permissions it needs, and Dependabot proposes updates.
- The `main` branch can't be force-pushed or deleted. Secret scanning with push protection is on.
