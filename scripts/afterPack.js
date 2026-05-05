const { execSync } = require('child_process')
const { existsSync } = require('fs')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) return

  console.log(`Cleaning extended attributes and resource forks from ${appPath}`)
  // Remove extended attributes
  execSync(`xattr -cr "${appPath}"`)
  // Remove HFS+ resource forks that xattr -cr doesn't handle
  execSync(`find "${appPath}" -type f -exec sh -c 'cat /dev/null > "$1/..namedfork/rsrc" 2>/dev/null; true' _ {} \\;`)
}
