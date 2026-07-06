rm -rf dist
rm -rf src-tauri/target/release/bundle
npm run build
grep -R "data:image" dist || echo "good: no inlined image data URLs"
grep -R '="/assets/' dist || echo "good: no root-relative asset paths"
npm run build:tauri
sudo dpkg -r controlstrip-simulator 2>/dev/null || true
sudo dpkg -i "src-tauri/target/release/bundle/deb/ControlStrip Simulator_0.1.0_arm64.deb"
