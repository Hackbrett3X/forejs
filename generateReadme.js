const jsdoc2md = require("jsdoc-to-markdown");
const filter = require("lodash/filter");
const fore = require("./src/forejs");
const fs = require("fs");

module.exports = function generateReadme(code) {
  return new Promise(function(resolve, reject) {
    fore.try(
        () => jsdoc2md.clear(), // seems to be necessary
        () => jsdoc2md.getTemplateData({source: code}),
        data => filter(data, entry => {
          const name = entry.name;
          const memberOf = entry.memberof;
          return entry.kind !== "constructor"
              && (name === "fore" || memberOf === "fore"
              || name === "inject"
              || name === "Injector" || (memberOf === "Injector" && name !== "Injector" && name !== "execute"));
        }),
        data => jsdoc2md.render({data: data}),
        resolve
    ).catch(reject);
  });
};
