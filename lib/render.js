const http = require("http");
const https = require("https");
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const sha256 = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex');

/**
 * make url for a diagram
 *
 * see https://docs.kroki.io/kroki/setup/encode-diagram/
 * @param baseUrl server's url
 * @param diagramType eg: vegalite, plantuml
 * @param source diagram to make the URL
 * @param format url format
 * @return string of URL
 */
function makeURL(baseUrl, diagramType, source, format) {
    const pako = require('pako')
    const data = Buffer.from(source, 'utf8')
    const compressed = pako.deflate(data, { level: 9 })
    const raw = Buffer.from(compressed)
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_')
    var url = [baseUrl, diagramType, format, raw].join('/')
    return url
}

/**
 * generate a file path but not created.
 * @param base eg: base dir
 * @param extention eg: exe,svg
 * @returns {string}
 */
function genFullFilePath(base, filename) {
    var dir = path.join(base, "puml");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, filename);
}

/**
 *
 * @param config
 * @param content
 * @param outputFormat
 * @returns {string|Promise<any>}
 */
function serverSideRendering(config, diagType, content) {
    var realUrl = makeURL(config.server, diagType, content, config.outputFormat);
    switch (config.link) {
        case "inlineUrlEncode":
        case "inlineBase64":
        case "inline":
            return new Promise((resolve, reject) => {
                (realUrl.startsWith("https") ? https : http).get(realUrl, response => {
                    var data = [];
                    response.on('data', function (chunk) {
                        data.push(chunk);
                    }).on('end', function () {
                        const buffer = Buffer.concat(data);
                        if (config.link === "inlineBase64") {
                            resolve(`<img class="${config.className}" src='data:image/svg+xml;base64,${buffer.toString("base64")}'>`);
                        } else if (config.link === "inlineUrlEncode") {
                            resolve(`<img class="${config.className}" src='data:image/svg+xml;utf8,${encodeURIComponent(buffer.toString())}'>`);
                        } else {
                            resolve(buffer.toString().replace(/<svg(.*?)>/g, `<svg $1 class="${config.className}">$2`))
                        }
                    });
                });
            })
        case "localLink":
            const base = path.join(config.public_dir, config.asset_path);
            if (!fs.existsSync(base)) {
                fs.mkdirSync(base, { recursive: true });
            }
            return new Promise((resolve, reject) => {
                (realUrl.startsWith("https") ? https : http).get(realUrl, response => {
                    const svgFile = genFullFilePath(base, sha256(content)) + "." + config.outputFormat;
                    var stream = response.pipe(fs.createWriteStream(svgFile));
                    stream.on("finish", function () {
                        const realUrl = svgFile.replace(config.public_dir, "");
                        resolve(`<img class="${config.className}" src="${realUrl}"/>`);
                    });
                });
            })
        case "externalLink":
            return `<img class="${config.className}" src="${realUrl}" />`;
    }
}

function appendAfterLine(str, line, toInsert){
    if (line === 0){
        return toInsert + '\n' + str;
    }
    var arr = str.split('\n')
    var tmp = ''
    for (var i = 0; i < arr.length; i++ ){
        if (i === line){
            tmp += toInsert + '\n'
        }
        tmp += arr[i] + '\n';
    }
    return tmp
}

module.exports = {
    config: {
        server: "https://kroki.io",
        // create <img src='data:image/svg+xml;base64> or <img src="/xxx.svg"> or <img src="http://third/svg/xxx">
        // "inline","inlineBase64","inlineUrlEncode","localLink","externalLink",
        link: "inlineBase64",

        // common options
        outputFormat: "svg", //svg/png
        // append some text after line, used for
        insert: {
            // the line number, eg: 0
            afterLine: 0,
            // the content to insert, eg: !theme sketchy-outline
            content: ''
        },
        // the img generated will have a default class name.
        className: 'kroki',

        //hidden option
        public_dir: "public",
        asset_path: "assert",
    },
    serverSideRendering: (config, diagType, content)=>{
        var insert = config.insert
        if (insert.content){
            content = appendAfterLine(content, insert.afterLine, insert.content)
        }
        return serverSideRendering(config, diagType, content)
    }
}