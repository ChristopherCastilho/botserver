/*****************************************************************************\
|  █████  █████ ██    █ █████ █████   ████  ██      ████   █████ █████  ███ ® |
| ██      █     ███   █ █     ██  ██ ██  ██ ██      ██  █ ██   ██  █   █      |
| ██  ███ ████  █ ██  █ ████  █████  ██████ ██      ████   █   █   █    ██    |
| ██   ██ █     █  ██ █ █     ██  ██ ██  ██ ██      ██  █ ██   ██  █      █   |
|  █████  █████ █   ███ █████ ██  ██ ██  ██ █████   ████   █████   █   ███    |
|                                                                             |
| General Bots Copyright (c) pragmatismo.com.br. All rights reserved.          |
| Licensed under the AGPL-3.0.                                                |
|                                                                             |
| According to our dual licensing model, this program can be used either      |
| under the terms of the GNU Affero General Public License, version 3,        |
| or under a proprietary license.                                             |
|                                                                             |
| The texts of the GNU Affero General Public License with an additional       |
| permission and of our proprietary license can be found at and               |
| in the LICENSE file you have received along with this program.              |
|                                                                             |
| This program is distributed in the hope that it will be useful,             |
| but WITHOUT ANY WARRANTY, without even the implied warranty of              |
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                |
| GNU Affero General Public License for more details.                         |
|                                                                             |
| "General Bots" is a registered trademark of pragmatismo.com.br.              |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/


'use strict';

import { GBAdminService } from '../../admin.gbapp/services/GBAdminService.js';
import { GBVMService } from './GBVMService.js';
import path from 'path';

/**
 * Image processing services of conversation to be called by BASIC.
 */
export class KeywordsExpressions {
  public static splitParamsButIgnoreCommasInDoublequotes = (str: string) => {
    return str.split(',').reduce(
      (accum, curr) => {
        if (accum.isConcatting) {
          accum.soFar[accum.soFar.length - 1] += ',' + curr;
        } else {
          if (curr === '') {
            curr = null;
          }
          accum.soFar.push(curr ? curr.trim() : '');
        }
        if (curr.split('`').length % 2 == 0) {
          accum.isConcatting = !accum.isConcatting;
        }
        return accum;
      },
      { soFar: [], isConcatting: false }
    ).soFar;
  };

  private static getParams = (text: string, names) => {
    const items = KeywordsExpressions.splitParamsButIgnoreCommasInDoublequotes(text);

    let i = 0;
    let json = '';
    names.forEach(name => {
      let value = items[i];
      i++;
      json = `${json} "${name}": ${value === undefined ? null : value} ${names.length == i ? '' : ','}`;
    });
    json = `${json}`;

    return json;
  };

  public static isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  /**
   * Returns the list of BASIC keyword and their JS match.
   * Based on https://github.com/uweg/vbscript-to-typescript.
   */
  public static getKeywords() {
    // Keywords from General Bots BASIC.

    let keywords = [];
    let i = 0;

    const convertConditions = input => {
      var result = input.replace(/ +and +/gim, ' && ');
      result = result.replace(/ +or +/gim, ' || ');
      result = result.replace(/ +not +/gim, ' !');
      result = result.replace(/ +<> +/gim, ' !== ');
      result = result.replace(/ += +/gim, ' === ');
      return result;
    };

    keywords[i++] = [
      /^\s*INPUT(.*)/gim,
      ($0, $1, $2) => {
        let separator;
        if ($1.indexOf(',') > -1) {
          separator = ',';
        } else if ($1.indexOf(';') > -1) {
          separator = ';';
        }
        let parts;
        if (separator && (parts = $1.split(separator)) && parts.length > 1) {
          return `
          TALK ${parts[0]}
          HEAR ${parts[1]}`;
        } else {
          return `
          HEAR ${$1}`;
        }
      }
    ];

    keywords[i++] = [
      /^\s*WRITE(.*)/gim,
      ($0, $1, $2) => {
        return `PRINT${$1}`;
      }
    ];

    keywords[i++] = [/^\s*REM.*/gim, ''];


    keywords[i++] = [/^\s*CLOSE.*/gim, ''];

    // Always autoclose keyword.

    keywords[i++] = [/^\s*CLOSE.*/gim, ''];

    keywords[i++] = [/^\s*\'.*/gim, ''];

    keywords[i++] = [
      /^\s*PRINT ([\s\S]*)/gim,
      ($0, $1, $2) => {
        let sessionName;
        let kind = null;
        let pos;
        $1 = $1.trim();

        if ($1.substr(0, 1) === '#') {
          sessionName = $1.substr(1, $1.indexOf(',') - 1);
          $1 = $1.replace(/\; \"\,\"/gi, '');
          $1 = $1.substr($1.indexOf(',') + 1);

          let separator;
          if ($1.indexOf(',') > -1) {
            separator = ',';
          } else if ($1.indexOf(';') > -1) {
            separator = ';';
          }
          let items;
          if (separator && (items = $1.split(separator)) && items.length > 1) {
            return `await sys.save({pid: pid, file: files[${sessionName}], args:[${items.join(',')}]})`;
          } else {
            return `await sys.set({pid: pid, file: files[${sessionName}], address: col++, name: "${items[0]}",   value:  ${items[0]}})`;
          }
        } else {
          return `await dk.talk({pid: pid, text: ${$1}})`;
        }
      }
    ];

    keywords[i++] = [
      /^\s*open([\s\S]*)/gim,
      ($0, $1, $2) => {
        let sessionName;
        let kind = null;
        let pos;

        $1 = $1.replace('FOR APPEND', '');
        $1 = $1.replace('FOR OUTPUT', '');

        if ((pos = $1.match(/\s*AS\s*\#/gi))) {
          kind = 'AS';
        } else if ((pos = $1.match(/\s*WITH\s*\#/gi))) {
          kind = 'WITH';
        }

        if (pos) {
          let part = $1.substr($1.lastIndexOf(pos[0]));
          sessionName = `${part.substr(part.indexOf('#') + 1)}`;
          $1 = $1.substr(0, $1.lastIndexOf(pos[0]));
        }
        $1 = $1.trim();
        if (!$1.startsWith('"') && !$1.startsWith("'")) {
          $1 = `"${$1}"`;
        }
        const params = this.getParams($1, ['url', 'username', 'password']);

        // Checks if it is opening a file or a webpage.

        if (kind === 'AS' && KeywordsExpressions.isNumber(sessionName)) {
          const jParams = JSON.parse(`{${params}}`);
          const filename = `${jParams.url.substr(0, jParams.url.lastIndexOf('.'))}.xlsx`;
          let code = `
           col = 1
           await sys.save({pid: pid,file: "${filename}", args: [id] })
           await dk.setFilter ({pid: pid, value:  "id=" + id })
           files[${sessionName}] = "${filename}"  
          `;
          return code;
        } else {
          sessionName = sessionName ? `"${sessionName}"` : null;
          kind = `"${kind}"`;
          return `page = await wa.openPage({pid: pid, handle: page, sessionKind: ${kind}, sessionName: ${sessionName}, ${params}})`;
        }
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*SELECT\s*(.*)/gim,
      ($0, $1, $2) => {
        let tableName = /\s*FROM\s*(\w+\$*)/.exec($2)[1];
        let sql = `SELECT ${$2}`.replace(tableName, '?');
        return `${$1} = await sys.executeSQL({pid: pid, data:${tableName}, sql:\`${sql}\`})\n`;
      }
    ];

    keywords[i++] = [/^\s*end if/gim, '}'];

    keywords[i++] = [
      /^\s*if +(.*?) +then/gim,
      (input, group1) => {
        var condition = convertConditions(group1);
        return 'if (' + condition + ') {';
      }
    ];

    keywords[i++] = [/^\s*return +(.*)/gim, 'resolve($1);'];

    keywords[i++] = [/^\s*else(?!{)/gim, '}\nelse {'];

    keywords[i++] = [/^\s*select case +(.*)/gim, 'switch ($1) {'];

    keywords[i++] = [/^\s*end select/gim, '}'];

    keywords[i++] = [/^\s*end function/gim, '}'];

    keywords[i++] = [/^\s*function +(.*)\((.*)\)/gim, 'const $1 = async ($2) => {\n'];

    keywords[i++] = [/^\s*for +(.*to.*)/gim, 'for ($1) {'];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*pay\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($2, ['orderId', 'customerName', 'ammount']);

        return `
          ${$1} = await sys.pay({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*do while +(.*)/gim,
      function (input, group1) {
        var condition = convertConditions(group1);
        return 'while (' + condition + ') {';
      }
    ];

    keywords[i++] = [/^\s*loop *$/gim, '}'];

    keywords[i++] = [
      /^\s*open([\s\S]*)/gim,
      ($0, $1, $2) => {
        let sessionName;
        let kind = null;
        let pos;

        $1 = $1.replace(' FOR APPEND', '');

        if ((pos = $1.match(/\s*AS\s*\#/))) {
          kind = 'AS';
        } else if ((pos = $1.match(/\s*WITH\s*\#/))) {
          kind = 'WITH';
        }

        if (pos) {
          let part = $1.substr($1.lastIndexOf(pos[0]));
          sessionName = `${part.substr(part.indexOf('#') + 1)}`;
          $1 = $1.substr(0, $1.lastIndexOf(pos[0]));
        }
        $1 = $1.trim();
        if (!$1.startsWith('"') && !$1.startsWith("'")) {
          $1 = `"${$1}"`;
        }
        const params = this.getParams($1, ['url', 'username', 'password']);

        // Checks if it is opening a file or a webpage.

        if (kind === 'AS' && KeywordsExpressions.isNumber(sessionName)) {
          const jParams = JSON.parse(`{${params}}`);
          const filename = `${path.basename(jParams.url, 'txt')}xlsx`;
          return `files[${sessionName}] = "${filename}"`;
        } else {
          sessionName = `"${sessionName}"`;
          kind = `"${kind}"`;
          return `page = await wa.openPage({pid: pid, handle: page, sessionKind: ${kind}, sessionName: ${sessionName}, ${params}})`;
        }
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*get config\s*(.*)/gim,
      ($0, $1, $2) => {
        return `${$1} = await dk.getConfig ({pid: pid, name: ${$2}})`;
      }
    ];

    keywords[i++] = [
      /\s*CONTINUATION TOKEN\s*/gim,
      () => {
        return `await dk.getContinuationToken ({pid: pid})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set hear on)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `hrOn = ${$3}`;
      }
    ];

    keywords[i++] = [/^\s*for each +(.*to.*)/gim, 'for ($1) {'];

    keywords[i++] = [
      /^\s*FOR EACH\s*(.*)\s*IN\s*(.*)/gim,
      ($0, $1, $2) => {
        return `
    
        __totalCalls = 10;
        __next  = true;
        __calls = 0;
        __data = ${$2};
        __index = 0;
        if (__data[0] && __data[0]['gbarray']) {
          __data = __data.slice(1);
        }        
        __pageMode = __data?.pageMode ? __data.pageMode : "none";

        __url = __data?.links?.next?.uri;
        __seekToken = __data.links?.self?.headers["MS-ContinuationToken"]; 
        __totalCount = __data?.totalCount ? __data.totalCount : __data.length;
 
        while (__next && __totalCount) 
        {
          let ${$1} = __data?.items ? __data?.items[__index] : __data[__index];
`;
      }
    ];

    keywords[i++] = [
      /^\s*next *$/gim,
      ($0, $1, $2) => {
        return `
            
        __index = __index + 1;

        // TRUE if all items are processed.

          if (__index === __totalCount) { 

            // Checks if HTTP call limit has reached.

            if (__calls < __totalCalls && __pageMode === "auto") {

              // Performs GET request using the constructed URL

              let ___data = null
              await retry(
                async (bail) => {
                    await ensureTokens();
                    ___data = await sys.getHttp ({pid: pid, file: __url, addressOrHeaders: headers, httpUsername, httpPs});
                },{ retries: 5});         

              __data = ___data
              ___data = null
                      
              // Updates current variable handlers.
              
              __url = __data?.links?.next?.uri;
              __seekToken = __data?.links?.self?.headers["MS-ContinuationToken"] 
              __totalCount = __data?.totalCount ? __data.totalCount : __data.length;
              
              __index = 0;
              __calls++;

            } else {

              __next = false;

            }
          }
          __data = null

        }`;
      }
    ];

    keywords[i++] = [
      /^\s*synchronize\s*(.*)/gim,
      ($0, $1) => {
        const items = KeywordsExpressions.splitParamsButIgnoreCommasInDoublequotes($1);
        const [url, tableName, key1, pageVariable, limitVariable] = items;

        return `
         
            if (!limit) limit = 100;
            __page = 1
            while (__page > 0 && __page < pages) {
              let __res = null
              await retry(
                async (bail) => {
                  await ensureTokens();
                  __res  = await sys.getHttp ({pid: pid, file: host + '${url}' + '?' + pageVariable + '=' + __page + '&' + limitVariable + '=' +  limit, addressOrHeaders: headers, httpUsername, httpPs})
                },{ retries: 5});
              
              await sleep(330);

              res  = __res
              __res = null
              list1 = res.data
              res = null


              let j1 = 0
              items1  = []
              while (j1 < ubound(list1)) {
                detail_id = caseInsensitive(list1[j1])['${key1}']
                let __res = null
                await retry(
                  async (bail) => {
                    await ensureTokens();
                    __res  = await sys.getHttp ({pid: pid, file: host + '${url}' + '/' + detail_id, addressOrHeaders: headers, httpUsername, httpPs})
                  },{ retries: 5});
                
                await sleep(330);
                 
                res  = __res
                __res = null

                items1[j1] = res.data
                res = null

                j1 = j1 + 1
              }
              __reportMerge1 = await sys.merge({pid: pid, file: '${tableName}' , data: items1 , key1: '${key1}'})
              items1 = null;

              __reportMerge.adds += __reportMerge1.adds;
              __reportMerge.updates += __reportMerge1.updates;
              __reportMerge.skipped += __reportMerge1.skipped;
              __reportMerge.title = __reportMerge1.title;
              REPORT = __report();

              __page = __page + 1

              if (list1?.length < limit) {
                __page = 0
              }
              list1 = null
            }


         `;
      }
    ];

    keywords[i++] = [
      /^\s*(.*)\=\s*(REWRITE)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['text']);
        return `${$1} = await sys.rewrite ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(.*)\=\s*(ANSWER)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['text']);
        return `${$1} = await sys.answer ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(.*)\=\s*(GET IMAGE)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['prompt']);
        return `${$1} = await img.getImageFromPrompt({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /\s*(SHOW IMAGE)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($3, ['file']);
        return `await sys.showImage({pid: pid, ${params}})`;
      }
    ];


    keywords[i++] = [
      /^\s*(.*)\=\s*(AUTO SAVE)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['handle']);
        return `await sys.autoSave ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(DEBUG)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['obj']);
        return `await sys.log ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(LOG)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['obj']);
        return `await sys.log ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(.*)\=\s*(DIR)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['remotePath']);
        return `${$1} = await sys.dirFolder ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(DELETE)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['table', 'criteria']);

        if (params[1]) {
          return `await sys.deleteFromStorage ({pid: pid, ${params}})`;
        } else {
          return `await sys.deleteFile ({pid: pid, ${params}})`;
        }
      }
    ];

    keywords[i++] = [
      /^\s*(.*)\=\s*(UPLOAD)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['file']);
        return `${$1} = await sys.uploadFile ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as (\w+( \w+)*.xlsx)/gim,
      ($0, $1, $2) => {
        return `${$1} = await dk.hear({pid: pid, kind:"sheet", arg: "${$2}"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*login/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"login"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*email/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"email"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*number/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"integer"})`;
      }
    ];


    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*integer/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"integer"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*file/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"file"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*boolean/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"boolean"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*name/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"name"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*date/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"date"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*hour/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"hour"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*phone/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"phone"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*money/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"money"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*qrcode/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"qrcode"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*language/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"language"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*zipcode/gim,
      ($0, $1) => {
        return `${$1} = await dk.hear({pid: pid, kind:"zipcode"})`;
      }
    ];

    keywords[i++] = [
      /^\s*hear (\w+\$*) as\s*(.*)/gim,
      ($0, $1, $2) => {
        return `${$1} = await dk.hear({pid: pid, kind:"menu", args: [${$2}]})`;
      }
    ];

    keywords[i++] = [
      /^\s*(hear)\s*(\w+\$*)/gim,
      ($0, $1, $2) => {
        return `${$2} = await dk.hear({pid: pid})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*find contact\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$1} = await dk.fndContact({pid: pid, ${$2}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*find\s*(.*)\s*or talk\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        `${$1} = caseInsensitive(await sys.find({pid: pid, handle: page, args:[${$2}]}))\n
        if (!${$1}) {
          await dk.talk ({pid: pid, text: ${$3}})\n;
          return -1;
        }
        return ${$1};
        `;
      }
    ];

    keywords[i++] = [
      /^\s*CALL\s*(.*)/gim,
      ($0, $1) => {
        return ` await ${$1}`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*find\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `
        ${$1} = caseInsensitive(await sys.find({pid: pid, handle: page, args: [${$2}]}))`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*create deal(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['dealName', 'contact', 'company', 'amount']);

        return `${$1} = await dk.createDeal({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*active tasks/gim,
      ($0, $1) => {
        return `${$1} = await dk.getActiveTasks({pid: pid})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*append\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$1} = await sys.append({pid: pid, args:[${$2}]})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*sort\s*(\w+\$*)\s*by(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$1} = await sys.sortBy({pid: pid, array: ${$2}, memberName: "${$3}"})`;
      }
    ];

    keywords[i++] = [
      /^\s*see\s*text\s*of\s*(\w+\$*)\s*as\s*(\w+\$*)\s*/gim,
      ($0, $1, $2, $3) => {
        return `${$2} = await sys.seeText({pid: pid, url: ${$1})`;
      }
    ];

    keywords[i++] = [
      /^\s*see\s*caption\s*of\s*(\w+\$*)\s*as(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$2} = await sys.seeCaption({pid: pid, url: ${$1})`;
      }
    ];

    keywords[i++] = [
      /^\s*(wait)\s*(.*)/gim,
      ($0, $1, $2) => {
        return `await sys.wait({pid: pid, seconds:${$2}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(ADD NOTE)\s*(.*)/gim,
      ($0, $1, $2) => {
        return `await sys.note({pid: pid, text:${$2}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(get stock for )(.*)/gim,
      ($0, $1, $2) => {
        return `stock = await sys.getStock({pid: pid, symbol: ${$2})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*get\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        const count = ($2.match(/\,/g) || []).length;
        const values = $2.split(',');

        // Handles GET "selector".

        if (count == 1) {
          return `${$1} =  await wa.getBySelector({pid: pid, handle:page, selector: ${values[0]}})`;
        }

        // Handles GET "frameSelector", "selector"
        else if (count == 2) {
          return `${$1} =  await wa.getByFrame({pid: pid, handle: page, ${values[0]}, frameOrSelector: ${values[1]}, selector: ${values[2]}})`;
        }

        // Handles the GET http version.
        else {

          return `

          if (${$2}.endsWith('.pdf') && !${$2}.startsWith('https')) {
            ${$1} = await sys.getPdf({pid: pid, file: ${$2}});
          } else {
            
            let __${$1} = null
            await retry(
            
            async (bail) => {
              await ensureTokens();
              __${$1} = await sys.getHttp ({pid: pid, file: ${$2}, addressOrHeaders: headers, httpUsername, httpPs})
            },{ retries: 5});         

            ${$1} = __${$1} 
                __${$1} = null
          }
          `;
        }
      }
    ];

    keywords[i++] = [
      /\= NEW OBJECT/gim,
      ($0, $1, $2, $3) => {
        return ` = {}`;
      }
    ];

    keywords[i++] = [
      /\= NEW ARRAY/gim,
      ($0, $1, $2, $3) => {
        return ` = []`;
      }
    ];

    keywords[i++] = [
      /^\s*(go to)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['fromOrDialogName', 'dialogName']);
        return `await dk.gotoDialog({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(SET CONTEXT)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['text']);
        return `await sys.setContext({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(SET ANSWER MODE)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['mode']);
        return `await sys.setAnswerMode({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set language)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setLanguage ({pid: pid, language: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(allow role)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.allowRole ({pid: pid, role: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(ALLOW ROLE)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        return `${$1} =  await dk.allowRole ({pid: pid, role: ${$4}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set filter)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setFilter ({pid: pid, ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set page mode)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setPageMode ({pid: pid, value: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*set param \s*(.*)\s*as\s*(.*)/gim,
      ($0, $1, $2) => {
        return `await dk.setUserParam ({pid: pid, ${$1}}, ${$2})`;
      }
    ];

    keywords[i++] = [
      /^\s*set header\s*(.*)\s*as\s*(.*)/gim,
      ($0, $1, $2) => {
        return `headers[${$1.trim()}] = ${$2}`;
      }
    ];

    keywords[i++] = [
      /^\s*set http username\s*\=\s*(.*)/gim,
      ($0, $1) => {
        return `httpUsername = ${$1}`;
      }
    ];

    keywords[i++] = [
      /^\s*set http password\s*\=\s*(.*)/gim,
      ($0, $1) => {
        return `httpPs = ${$1}`;
      }
    ];

    keywords[i++] = [
      /^\s*(POST TO INSTAGRAM)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['username', 'password', 'imagePath', 'caption']);
        return `await sys.postToInstagram ({pid: pid, ${params}})`;
      }
    ];


    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(datediff)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['date1', 'date2', 'mode']);
        return `${$1} = await dk.getDateDiff ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(user of)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['username']);
        return `${$1} = await sys.getUser ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(.*)\=\s*(dateadd)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['date', 'mode', 'units']);
        return `${$1} = await dk.dateAdd ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set output)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setOutput ({pid: pid, value: "${$3}"})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set max lines)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setMaxLines ({pid: pid, count: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set max columns)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setMaxColumns ({pid: pid, count: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set translator)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setTranslatorOn ({pid: pid, on: "${$3.toLowerCase()}"})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set theme)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setTheme ({pid: pid, theme: "${$3.toLowerCase()}"})`;
      }
    ];

    keywords[i++] = [
      /^\s*(set whole word)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.setWholeWord ({pid: pid, on: "${$3.toLowerCase()}"})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*post\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        const args = $2.split(',');

        return `
        await retry(
          async (bail) => {
            await ensureTokens();

            __${$1} = await sys.postByHttp ({pid: pid, url:${args[0]}, data:${args[1]}, headers})
          },{ retries: 5});         

          ${$1} = __${$1} 
        `;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*put\s*(.*),\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `

        await retry(
          async (bail) => {
            await ensureTokens();
            __${$1} = await sys.putByHttp ({pid: pid, url:${$2}, data:${$3}, headers})
          },{ retries: 5});         

        ${$1} = __${$1} 

        `;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*download\s*(.*),\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$1} = await sys.download ({pid: pid, handle:page, selector: ${$2}, folder:${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*CREATE FOLDER\s*(.*)/gim,
      ($0, $1, $2) => {
        return `${$1} = await sys.createFolder ({pid: pid, name:${$2}})`;
      }
    ];

    keywords[i++] = [
      /^\s*SHARE FOLDER\s*(.*)/gim,
      ($0, $1) => {
        return `await sys.shareFolder ({pid: pid, name: ${$1}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(create a bot farm using)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await sys.createABotFarmUsing ({pid: pid, ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(transfer to)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await dk.transferTo ({pid: pid, to:${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(\btransfer\b)(?=(?:[^"]|"[^"]*")*$)/gim,
      () => {
        return `await dk.transferTo ({pid: pid})`;
      }
    ];

    keywords[i++] = [
      /^\sEXIT\s*$/gim,
      () => {
        return `return;`;
      }
    ];

    keywords[i++] = [
      /^\s*END\s*$/gim,
      () => {
        return `return;`;
      }
    ];

    keywords[i++] = [
      /^\s*(show menu)/gim,
      () => {
        return `await dk.showMenu ({pid: pid, })`;
      }
    ];

    keywords[i++] = [
      /^\s*(talk to)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['mobile', 'message']);
        return `await sys.talkTo({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(talk)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        $3 = GBVMService.normalizeQuotes($3);

        // // Uses auto quote if this is a phrase with more then one word.

        if (!($3.trim().substr(0, 1) === '`' || $3.trim().substr(0, 1) === "'")) {
          $3 = '`' + $3 + '`';
        }
        return `await dk.talk ({pid: pid, text: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(send sms to)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['mobile', 'message']);
        return `await sys.sendSmsTo({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(FORMAT)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['value', 'format']);
        return `${$1} = await dk.format({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(send email)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['to', 'subject', 'body']);
        return `await dk.sendEmail({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(send mail)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['to', 'subject', 'body']);
        return `await dk.sendEmail({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(send file to)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['mobile', 'filename', 'caption']);
        return `await dk.sendFileTo({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(send template to)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['mobile', 'filename']);
        return `await dk.sendTemplateTo({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(hover)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['selector']);
        return `await wa.hover ({pid: pid, handle: page, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(click link text)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['text', 'index']);
        return `await wa.linkByText ({pid: pid, handle: page, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(text of)(\s*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        const params = this.getParams($4, ['frameOrSelector', 'selector']);
        return `
        ${$1} = await wa.getTextOf ({pid: pid, handle: page, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(click button)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['text', 'index']);
        return `await wa.clickButton ({pid: pid, handle: page, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(click)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        // page is not string.
        // https://github.com/GeneralBots/BotServer/issues/310
        const params = this.getParams($3, ['frameOrSelector', 'selector']);
        return `await wa.click ({pid: pid, handle:page, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(send file)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['filename', 'caption']);
        return `await dk.sendFile({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(copy)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['src', 'dest']);
        return `await sys.copyFile ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(convert)(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['src', 'dest']);
        return `await sys.convert ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*chart(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['type', 'data', 'legends', 'transpose']);
        return `${$1} = await dk.chart ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*chart prompt(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($3, ['type', 'data', 'prompt']);
        return `${$1} = await dk.llmChart ({pid: pid, ${params}})`;
      }
    ];

    keywords[i++] = [
      /^\s*MERGE\s*(.*)\s*WITH\s*(.*)BY\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `__reportMerge1 = await sys.merge({pid: pid, file: ${$1}, data: ${$2}, key1: ${$3}})
        ${$2.replace(/\`/g, '')} = null;
        __reportMerge.adds += __reportMerge1.adds;
        __reportMerge.updates += __reportMerge1.updates;
        __reportMerge.skipped += __reportMerge1.skipped;
        __reportMerge.title = __reportMerge1.title;
        REPORT = __report();

        `;
      }
    ];

    keywords[i++] = [
      /^\s*RESET REPORT\s*/gim,
      ($0, $1, $2, $3) => {
        return `
          __reportMerge.adds = 0;
          __reportMerge.updates = 0;
          __reportMerge.skipped = 0;
          `;
      }
    ];

    keywords[i++] = [
      /^\s*MERGE IMAGE(\s*)(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await img.mergeImage({pid: pid, files: [${$3}]})`;
      }
    ];

    keywords[i++] = [
      /^\s*PRESS\s*(.*)/gim,
      ($0, $1, $2) => {
        return `await wa.pressKey({pid: pid, handle: page, char: ${$1}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*SCREENSHOT\s*(.*)/gim,
      ($0, $1, $2) => {
        return `${$1} = await wa.screenshot({pid: pid, handle: page, selector: ${$1}})`;
      }
    ];

    keywords[i++] = [
      /^\s*TWEET\s*(.*)/gim,
      ($0, $1, $2) => {
        return `await sys.tweet({pid: pid, text: ${$1}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(.*)\s*as\s*image/gim,
      ($0, $1, $2) => {
        return `${$1} = await sys.asImage({pid: pid, data: ${$2}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*(.*)\s*as\s*pdf/gim,
      ($0, $1, $2) => {
        return `${$1} = await sys.asPdf({pid: pid, data: ${$2}})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*FILL\s*(.*)\s*WITH\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$1} = await sys.fill({pid: pid, templateName: ${$2}, data: ${$3}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(save)(\s*)(.*\.(xlsx|csv))(.*)/gim,
      ($0, $1, $2, $3, $4, $5) => {
        $3 = $3.replace(/\'/g, '');
        $3 = $3.replace(/\"/g, '');
        $3 = $3.replace(/\`/g, '');
        $5 = $5.substr(2);
        return `await sys.save({pid: pid, file: "${$3}", args: [${$5}]})`;
      }
    ];

    keywords[i++] = [
      /^\s*save\s*(\w+\$*)\s*as\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await sys.saveFile({pid: pid, file: ${$2}, data: ${$1}})`;
      }
    ];

    keywords[i++] = [
      /^\s*(refresh)\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `await sys.refreshDataSourceCache({pid: pid, connectionName: ${$2}})`;
      }
    ];
  
    keywords[i++] = [
      /^\s*(save)(\s*)(.*)(.*)/gim,
      ($0, $1, $2, $3, $4) => {
        $3 = $3.replace(/\'/g, '');
        $3 = $3.replace(/\"/g, '');
        let fields = $3.split(',');
        const table = fields[0].trim();

        fields.shift();

        const fieldsAsText = fields.join(',');
        let fieldsNamesOnly = [];
        let index = 0;

        fields.forEach(field => {
          // Extracts only the last part of the variable like 'column'
          // from 'row.column'.

          const fieldRegExp = /(?:.*\.)*(.*)/gim;
          let name = fieldRegExp.exec(field.trim())[1];

          fieldsNamesOnly.push(`'${name}'`);
        });
        let fieldsNames = fieldsNamesOnly.join(',');

        // Checks if it is a collection or series of params.
        return `
        
        if (Array.isArray(${fields[0]}) || typeof ${fields[0]} === 'object') {
          await sys.saveToStorageBatch({pid: pid, table: ${table}, rows: ${fields[0]} })
        } else {
          await sys.saveToStorage({pid: pid, table: ${table}, fieldsValues: [${fieldsAsText}], fieldsNames: [${fieldsNames}] })
        }
        ${fields[0].replace(/\`/g, '')} = null;
      `;

      }
    ];

    keywords[i++] = [
      /^\s*set\s*(.*)/gim,
      ($0, $1, $2) => {
        const params = this.getParams($1, ['file', 'address', 'value']);
        return `await sys.set ({pid: pid, handle: page, ${params}})`;
      }
    ];
    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*BLUR\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `${$1} = await img.blur({pid: pid, args: [${$2}]})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*SHARPEN\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        return `
        ${$1} = await img.sharpen({pid: pid, args: [${$2}]})`;
      }
    ];

    keywords[i++] = [
      /^\s*((?:[a-z]+.?)(?:(?:\w+).)(?:\w+)*)\s*=\s*CARD\s*(.*)/gim,
      ($0, $1, $2, $3) => {
        const params = this.getParams($1, ['doc', 'data']);
        return `
        ${$1} = await dk.card({pid: pid, args: [${$2}]})`;
      }
    ];

    return keywords;
  }
}
