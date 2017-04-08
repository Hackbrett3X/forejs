const jsdoc2md = require("jsdoc-to-markdown");
const filter = require("lodash/filter");
const fore = require("./src/forejs");
const fs = require("fs");

const readmeTemplatePath = "./templates/readme.md";

module.exports = function generateReadme(code) {
  return new Promise(function (resolve, reject) {
    fore.try({
      clear: () => jsdoc2md.clear(), // seems to be necessary

      templateData: ["clear", () => jsdoc2md.getTemplateData({source: code})],
      filteredData: ["templateData", data => filter(data, entry => {
        const name = entry.name;
        const memberOf = entry.memberof;
        return entry.kind !== "constructor"
            && (name === "fore" || memberOf === "fore"
            || name === "inject"
            || name === "Injector" || (memberOf === "Injector" && name !== "Injector" && name !== "execute"));
      })],

      template: fs.readFile.inject.args(readmeTemplatePath, "utf-8"),

      render: ["filteredData", "template", (data, template) => jsdoc2md.render({data, template, "heading-depth": 3})],

      fixLinks: ["render", renderResult => renderResult.replace(/([^!])\[([^\[\]\n]+)]\(([^)\n]+)\)/g, '$1<a href="$3">$2</a>')],

      _: ["fixLinks", resolve]
    }).catch(reject);
  });
};
