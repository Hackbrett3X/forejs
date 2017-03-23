const fore = require("./src/forejs");
const ref = fore.ref;
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const generateReadme = require("./generateReadme");

const srcName = "forejs.js";
const srcPath = "./src";
const licensePath = "./LICENSE";
const packagePath = "./package.json";

const distPath = "./dist";
const distName = "forejs.js";

const readmePath = "README.md";

const encoding = "utf-8";

fore.try({
  clear: rimraf.inject.args(distPath),
  distFolder: ["clear", (clear, cb) => fs.mkdir(distPath, cb)],

  code: fs.readFile.inject.args(path.join(srcPath, srcName), encoding),
  license: fs.readFile.inject.args(licensePath, encoding),
  packageJsonFile: fs.readFile.inject.args(packagePath, encoding),
  packageJson: ["packageJsonFile", (packageJsonFile) => JSON.parse(packageJsonFile)],

  output: ["license", "packageJson", "code", function (license, packageJson, code) {
    return [
      wrapWithMultilineComment(license),
      ["/**", " foreJs", " @version " + packageJson.version, "/"].join("\n *"),
      code
    ].join("\n\n");
  }],

  write: ["output", "distFolder", function (output, distFolder, cb) {
    fs.writeFile(path.join(distPath, distName), output, cb);
  }],

  readme: generateReadme.inject.args(ref("code")),
  writeReadme: fs.writeFile.inject.args(readmePath, ref("readme")),

  _: ["write", "writeReadme", () => console.log("Build successful.")]
}).catch(console.error);

function wrapWithMultilineComment(string) {
  return "/*\n" + string + "\n*/";
}