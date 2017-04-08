const fore = require("./src/forejs");
const ref = fore.ref;
const collect = fore.collect;
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const uglifyJs = require("uglify-js");

const generateReadme = require("./generateReadme");

const srcName = "forejs.js";
const srcPath = "./src";
const licensePath = "./LICENSE";
const packagePath = "./package.json";

const distPath = "./dist";
const nodeName = "forejs.js";
const browserName = "forejs.min.js";
const es6Name = "forejs.es6.js";

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
  packageJson: [cb => fs.readFile(packagePath, encoding, cb), file => JSON.parse(file)],

  browserVersion: ["code", code => {
    code = replaceModuleExports("return $1;", code);
    code = wrapWithUmdHeader(code, "fore");
    code =  uglifyJs.minify(code, uglifyOptions).code;
    return {code, outPath: path.join(distPath, browserName)};
  }],
  es6Version: ["code", code => {
    return {code: replaceModuleExports("export default $1;", code), outPath: path.join(distPath, es6Name)}
  }],
  nodeVersion: ["code", code => {return {code, outPath: path.join(distPath, nodeName)}}],

  header: ["browserVersion|es6Version|nodeVersion", "license", "packageJson", (file, license, packageJson) => {
    file.code = prependHeaderComment(license, packageJson, file.code);
    return file;
  }],

  write: ["header", "distFolder", (file, _, cb) => fs.writeFile(file.outPath, file.code, cb)],

  readme: generateReadme.inject.args(ref("code")),
  readmeWithLicense: ["readme", "license", (readme, license) => [readme, "## License", license].join("\n\n")],
  writeReadme: fs.writeFile.inject.args(readmePath, ref("readmeWithLicense")),

  _: collect(["write", "writeReadme", () => console.log("Build successful.")])
}).catch(console.error);

function wrapWithMultilineComment(string) {
  return "/*\n" + string + "\n*/";
}

function replaceModuleExports(by, code) {
  return code.replace(/^module\.exports\s*=\s*([a-zA-Z$_]+)\s*;?$/m, by);
}

function prependHeaderComment(license, packageJson, code) {
  return `${wrapWithMultilineComment(license)}

/**
 * ${packageJson.description}
 * @module foreJs
 * @version ${packageJson.version}
 */

${code}`;
}

function wrapWithUmdHeader(code, name) {
  return `
"use strict";
(function (r, n, f) {
  function isObject(x) { return typeof x === "object"; }
  try {
    if (isObject(module) && isObject(module.exports)) {
      return module.exports = f();
    }
  } catch (e) {}
  if (isObject(r.exports)) {
    r.exports[n] = f();
  } else if (typeof r.define === "function" && r.define.amd) {
    r.define(f);
  } else {
    r[n] = f();
  }
})(typeof global === "object" ? global : typeof window === "object" ? window : this, "${name}", function () {
${code}
});
`
}