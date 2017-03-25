const fore = require("./src/forejs");
const ref = fore.ref;
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const fidUmd = new (require("fid-umd"))();
const uglifyJs = require("uglify-js");

const generateReadme = require("./generateReadme");

const srcName = "forejs.js";
const srcPath = "./src";
const licensePath = "./LICENSE";
const packagePath = "./package.json";

const distPath = "./dist";
const nodeName = "forejs.js";
const browserName = "forejs.min.js";

const readmePath = "README.md";

const encoding = "utf-8";

const uglifyOptions = {
  fromString: true,
  mangle: true,
  compress: {
    properties: true,
    dead_code: true,
    comparisons: true,
  }
};

fore.try({
  clear: rimraf.inject.args(distPath),
  distFolder: ["clear", (clear, cb) => fs.mkdir(distPath, cb)],

  code: fs.readFile.inject.args(path.join(srcPath, srcName), encoding),
  license: fs.readFile.inject.args(licensePath, encoding),
  packageJsonFile: fs.readFile.inject.args(packagePath, encoding),
  packageJson: ["packageJsonFile", (packageJsonFile) => JSON.parse(packageJsonFile)],

  minified: ["code", code => {
    code = replaceModuleExports("return $1;", code);
    code = '// fid-umd {"name": "fore"}\n\n' + code;
    code = fidUmd.update(code);
    return uglifyJs.minify(code, uglifyOptions).code;
  }],

  browserVersion: ["license", "packageJson", "minified", prependHeaderComment],
  nodeVersion: ["license", "packageJson", "code", prependHeaderComment],

  writeBrowser: ["browserVersion", "distFolder", function (output, distFolder, cb) {
    fs.writeFile(path.join(distPath, browserName), output, cb);
  }],
  writeNode: ["nodeVersion", "distFolder", function (output, distFolder, cb) {
    fs.writeFile(path.join(distPath, nodeName), output, cb);
  }],

  readme: generateReadme.inject.args(ref("code")),
  readmeWithLicense: ["readme", "license", (readme, license) => [readme, "## License", license].join("\n\n")],
  writeReadme: fs.writeFile.inject.args(readmePath, ref("readmeWithLicense")),

  _: ["writeNode", "writeBrowser", "writeReadme", () => console.log("Build successful.")]
}).catch(console.error);

function wrapWithMultilineComment(string) {
  return "/*\n" + string + "\n*/";
}

function replaceModuleExports(by, code) {
  return code.replace(/^module\.exports\s*=\s*([a-zA-Z$_]+)\s*;?$/m, by);
}

function prependHeaderComment(license, packageJson, code) {
  return [
    wrapWithMultilineComment(license),
    ["/**", " foreJs", " @version " + packageJson.version, "/"].join("\n *"),
    code
  ].join("\n\n");
}