/*****************************************************************************\
|                                               ( )_  _                       |
|    _ _    _ __   _ _    __    ___ ___     _ _ | ,_)(_)  ___   ___     _     |
|   ( '_`\ ( '__)/'_` ) /'_ `\/' _ ` _ `\ /'_` )| |  | |/',__)/' v `\ /'_`\   |
|   | (_) )| |  ( (_| |( (_) || ( ) ( ) |( (_| || |_ | |\__, \| (˅) |( (_) )  |
|   | ,__/'(_)  `\__,_)`\__  |(_) (_) (_)`\__,_)`\__)(_)(____/(_) (_)`\___/'  |
|   | |                ( )_) |                                                |
|   (_)                 \___/'                                                |
|                                                                             |
| General Bots Copyright (c) Pragmatismo.io. All rights reserved.             |
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
| "General Bots" is a registered trademark of Pragmatismo.io.                 |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

'use strict';

import { GBLog, GBMinInstance, GBService, IGBCoreService, GBDialogStep } from 'botlib';
import * as fs from 'fs';
import { GBDeployer } from '../../core.gbapp/services/GBDeployer';
import { TSCompiler } from './TSCompiler';
import { CollectionUtil } from 'pragmatismo-io-framework';
import { DialogKeywords } from './DialogKeywords';
import { ScheduleServices } from './ScheduleServices';
import { GBConfigService } from '../../core.gbapp/services/GBConfigService';
//tslint:disable-next-line:no-submodule-imports
const urlJoin = require('url-join');
const { NodeVM, VMScript } = require('vm2');
const { createVm2Pool } = require('./vm2-process/index');
const vb2ts = require('./vbscript-to-typescript');
const beautify = require('js-beautify').js;
const textract = require('textract');
const walkPromise = require('walk-promise');
const child_process = require('child_process');
const Path = require('path');

/**
 * @fileoverview Virtualization services for emulation of BASIC.
 * This alpha version is using a antipattern hack in form of converter to
 * translate BASIC to TS and string replacements to emulate await code.
 * See https://github.com/uweg/vbscript-to-typescript for more info on vb2ts, so
 * http://stevehanov.ca/blog/index.php?id=92 should be used to run it without
 * translation and enhance classic BASIC experience.
 */

/**
 * Basic services for BASIC manipulation.
 */
export class GBVMService extends GBService {
  public async loadDialogPackage(folder: string, min: GBMinInstance, core: IGBCoreService, deployer: GBDeployer) {
    const files = await walkPromise(folder);

    await CollectionUtil.asyncForEach(files, async file => {
      if (!file) {
        return;
      }

      let filename: string = file.name;

      if (filename.endsWith('.docx')) {
        const wordFile = filename;
        const vbsFile = filename.substr(0, filename.indexOf('docx')) + 'vbs';
        const fullVbsFile = urlJoin(folder, vbsFile);
        const docxStat = fs.statSync(urlJoin(folder, wordFile));
        const interval = 3000; // If compiled is older 30 seconds, then recompile.
        let writeVBS = true;
        if (fs.existsSync(fullVbsFile)) {
          const vbsStat = fs.statSync(fullVbsFile);
          if (docxStat['mtimeMs'] < vbsStat['mtimeMs'] + interval) {
            writeVBS = false;
          }
        }
        filename = vbsFile;
        let mainName = GBVMService.getMethodNameFromVBSFilename(filename);
        min.scriptMap[filename] = mainName;

        if (writeVBS) {
          let text = await this.getTextFromWord(folder, wordFile);

          const schedule = GBVMService.getSetScheduleKeywordArgs(text);
          const s = new ScheduleServices();
          if (schedule) {
            await s.createOrUpdateSchedule(min, schedule, mainName);
          }
          else {
            await s.deleteScheduleIfAny(min, mainName);
          }
          text = text.replace(/SET SCHEDULE (.*)/gi, '');
          fs.writeFileSync(urlJoin(folder, vbsFile), text);
        }

        // Process node_modules install.

        const node_modules = urlJoin(folder, 'node_modules');
        if (!fs.existsSync(node_modules)) {
          const packageJson = `
            {
              "name": "${min.botId}.gbdialog",
              "version": "1.0.0",
              "description": "${min.botId} transpiled .gbdialog",
              "author": "${min.botId} owner.",
              "license": "ISC",
              "dependencies": {
                "encoding": "0.1.13",
                "isomorphic-fetch": "3.0.0",
                "punycode": "2.1.1",
                "typescript-rest-rpc": "1.0.10",
                "vm2": "3.9.11"
              }
            }`;
          fs.writeFileSync(urlJoin(folder, 'package.json'), packageJson);

          GBLog.info(`BASIC: Installing .gbdialog node_modules for ${min.botId}...`);
          const npmPath = urlJoin(process.env.PWD, 'node_modules', '.bin', 'npm');
          child_process.execSync(`${npmPath} install`, { cwd: folder });
        }

        // Hot swap for .vbs files.

        const fullFilename = urlJoin(folder, filename);
        if (process.env.GBDIALOG_HOTSWAP) {
          fs.watchFile(fullFilename, async () => {
            await this.translateBASIC(fullFilename, min, deployer, mainName);
          });
        }

        const compiledAt = fs.statSync(fullFilename);
        const jsfile = urlJoin(folder, `${filename}.js`);

        if (fs.existsSync(jsfile)) {
          const jsStat = fs.statSync(jsfile);
          const interval = 30000; // If compiled is older 30 seconds, then recompile.
          if (compiledAt.isFile() && compiledAt['mtimeMs'] > jsStat['mtimeMs'] + interval) {
            await this.translateBASIC(fullFilename, min, deployer, mainName);
          } else {
            const parsedCode: string = fs.readFileSync(jsfile, 'utf8');

            min.sandBoxMap[mainName.toLowerCase().trim()] = parsedCode;
          }
        } else {
          await this.translateBASIC(fullFilename, min, deployer, mainName);
        }
      }
    });
  }

  public static getMethodNameFromVBSFilename(filename: string) {
    let mainName = filename.replace(/\s|\-/gi, '').split('.')[0];
    return mainName.toLowerCase();
  }

  public static getSetScheduleKeywordArgs(code: string) {
    if (!code)
      return null;
    const keyword = /SET SCHEDULE (.*)/gi;
    const result = keyword.exec(code);
    return result ? result[1] : null;
  }

  private async getTextFromWord(folder: string, filename: string) {
    return new Promise<string>(async (resolve, reject) => {
      textract.fromFileWithPath(urlJoin(folder, filename), { preserveLineBreaks: true }, (error, text) => {
        if (error) {
          reject(error);
        } else {
          text = text.replace('“', '"');
          text = text.replace('”', '"');
          text = text.replace('‘', "'");
          text = text.replace('’', "'");

          resolve(text);
        }
      });
    });
  }

  /**
   * Converts General Bots BASIC
   *
   *
   * @param code General Bots BASIC
   */
  public convertGBASICToVBS(min: GBMinInstance, code: string) {

    // Start and End of VB2TS tags of processing.

    code = `<%\n


    ${process.env.ENABLE_AUTH ? `hear gbLogin as login` : ``}

    ${code}

    `;

    // Keywords from General Bots BASIC.

    code = code.replace(/(\w+)\s*\=\s*SELECT\s*(.*)/gi, ($0, $1, $2) => {

      let tableName = /\sFROM\s(\w+)/.exec($2)[1];
      let sql = `SELECT ${$2}`.replace(tableName, '?');
      return `${$1} = await sys.executeSQL(${$1}, "${sql}", "${tableName}")\n`;
    });

    code = code.replace(/(\w+)\s*\=\s*get html\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await dk.getPage(step, ${$2})\n`;
    });

    code = code.replace(/(set hear on)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `hrOn = ${$3}\n`;
    });

    code = code.replace(/hear (\w+) as login/gi, ($0, $1) => {
      return `${$1} = await dk.hear("login")`;
    });

    code = code.replace(/hear (\w+) as email/gi, ($0, $1) => {
      return `${$1} = await dk.hear("email")`;
    });

    code = code.replace(/hear (\w+) as integer/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("integer")`;
    });

    code = code.replace(/hear (\w+) as file/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("file")`;
    });

    code = code.replace(/hear (\w+) as boolean/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("boolean")`;
    });

    code = code.replace(/hear (\w+) as name/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("name")`;
    });

    code = code.replace(/hear (\w+) as date/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("date")`;
    });

    code = code.replace(/hear (\w+) as hour/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("hour")`;
    });

    code = code.replace(/hear (\w+) as phone/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("phone")`;
    });

    code = code.replace(/hear (\w+) as money/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("money")`;
    });

    code = code.replace(/hear (\w+) as language/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("language")`;
    });

    code = code.replace(/hear (\w+) as zipcode/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("zipcode")`;
    });

    code = code.replace(/hear (\w+) as (.*)/gi, ($0, $1, $2) => {
      return `${$1} = await dk.hear("menu", ${$2})`;
    });

    code = code.replace(/(hear)\s*(\w+)/gi, ($0, $1, $2) => {
      return `${$2} = await dk.hear()`;
    });

    code = code.replace(/(\w)\s*\=\s*find contact\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await dk.fndContact(${$2})\n`;
    });

    code = code.replace(/(\w+)\s*=\s*find\s*(.*)\s*or talk\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await await sys.find(${$2})\n
      if (!${$1}) {
        await dk.talk (${$3})\n;
        return -1;
      }
      `;
    });

    code = code.replace(/CALL\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.callVM("${$1}", dk.getMin(), dk.getStep(), dk.getDeployer())\n`;
    });

    code = code.replace(/(\w)\s*\=\s*find\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await sys.find(${$2})\n`;
    });

    code = code.replace(/(\w)\s*\=\s*create deal(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await dk.createDeal(${$3})\n`;
    });

    code = code.replace(/(\w)\s*\=\s*active tasks/gi, ($0, $1) => {
      return `${$1} = await dk.getActiveTasks()\n`;
    });

    code = code.replace(/(\w)\s*\=\s*append\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await sys.append(${$2})\n`;
    });

    code = code.replace(/(\w+)\s*\=\s*sort\s*(\w+)\s*by(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await sys.sortBy(${$2}, "${$3}")\n`;
    });

    code = code.replace(/see\s*text\s*of\s*(\w+)\s*as\s*(\w+)\s*/gi, ($0, $1, $2, $3) => {
      return `${$2} = await sys.seeText(${$1})\n`;
    });

    code = code.replace(/see\s*caption\s*of\s*(\w+)\s*as(.*)/gi, ($0, $1, $2, $3) => {
      return `${$2} = await sys.seeCaption(${$1})\n`;
    });

    code = code.replace(/(wait)\s*(\d+)/gi, ($0, $1, $2) => {
      return `await sys.wait(${$2})`;
    });

    code = code.replace(/(get stock for )(.*)/gi, ($0, $1, $2) => {
      return `stock = await sys.getStock(${$2})`;
    });

    code = code.replace(/(\w+)\s*\=\s*get\s(.*)/gi, ($0, $1, $2, $3) => {

      const count = ($2.match(/\,/g) || []).length;
      const values = $2.split(',');

      // Handles GET page, "selector".

      if (count == 1) {

        return `${$1} =  await dk.getBySelector(${values[0]}, ${values[1]} )`;
      }

      // Handles GET page, "frameSelector", "selector"

      else if (count == 2) {

        return `${$1} =  await dk.getByFrame(${values[0]}, ${values[1]}, ${values[2]} )`;
      }

      // Handles the GET http version.

      else {

        return `${$1} = await sys.get (${$2}, headers, httpUsername, httpPs)`;
      }

    });

    code = code.replace(/\= NEW OBJECT/gi, ($0, $1, $2, $3) => {
      return ` = {}`;
    });

    code = code.replace(/\= NEW ARRAY/gi, ($0, $1, $2, $3) => {
      return ` = []`;
    });


    code = code.replace(/(go to)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.gotoDialog(step, ${$3})\n`;
    });

    code = code.replace(/(set language)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.setLanguage (step, ${$3})\n`;
    });

    code = code.replace(/set header\s*(.*)\sas\s(.*)/gi, ($0, $1, $2) => {
      return `headers[${$1}]=${$2})`;
    });

    code = code.replace(/set http username\s*\=\s*(.*)/gi, ($0, $1) => {
      return `httpUsername = ${$1}`;
    });

    code = code.replace(/set http password\s*\=\s*(.*)/gi, ($0, $1) => {
      return `httpPs = ${$1}`;
    });

    code = code.replace(/(datediff)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.dateDiff (step, ${$3})\n`;
    });

    code = code.replace(/(dateadd)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.dateAdd (step, ${$3})\n`;
    });

    code = code.replace(/(set max lines)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.setMaxLines (step, ${$3})\n`;
    });

    code = code.replace(/(set max columns)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.setMaxColumns (step, ${$3})\n`;
    });

    code = code.replace(/(set translator)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.setTranslatorOn (step, "${$3.toLowerCase()}")\n`;
    });

    code = code.replace(/(set theme)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.setTheme (step, "${$3.toLowerCase()}")\n`;
    });

    code = code.replace(/(set whole word)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.setWholeWord (step, "${$3.toLowerCase()}")\n`;
    });

    code = code.replace(/(\w+)\s*\=\s*post\s*(.*),\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await sys.postByHttp (${$2}, ${$3}, headers)`;
    });

    code = code.replace(/(\w+)\s*\=\s*put\s*(.*),\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await sys.putByHttp (${$2}, ${$3}, headers)`;
    });

    code = code.replace(/(\w+)\s*\=\s*download\s*(.*),\s*(.*)/gi, ($0, $1, $2, $3) => {
      return `${$1} = await sys.download (${$2}, ${$3})`;
    });

    code = code.replace(/(\w+)\s*\=\s*CREATE FOLDER\s*(.*)/gi, ($0, $1, $2) => {
      return `${$1} = await sys.createFolder (${$2})`;
    });

    code = code.replace(/SHARE FOLDER\s*(.*)/gi, ($0, $1) => {
      return `await sys.shareFolder (${$1})`;
    });

    code = code.replace(/(create a bot farm using)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.createABotFarmUsing (${$3})`;
    });

    code = code.replace(/(chart)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.chart (step, ${$3})\n`;
    });

    code = code.replace(/(transfer to)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.transferTo (step, ${$3})\n`;
    });

    code = code.replace(/(\btransfer\b)(?=(?:[^"]|"[^"]*")*$)/gi, () => {
      return `await dk.transferTo (step)\n`;
    });

    code = code.replace(/(exit)/gi, () => {
      return ``;
    });

    code = code.replace(/(show menu)/gi, () => {
      return `await dk.showMenu (step)\n`;
    });

    code = code.replace(/(talk to)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.talkTo(${$3})\n`;
    });

    code = code.replace(/(talk)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.talk (step, ${$3})\n`;
    });

    code = code.replace(/(send sms to)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.sendSmsTo (${$3})\n`;
    });

    code = code.replace(/(send email)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.sendEmail (${$3})\n`;
    });

    code = code.replace(/(send mail)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.sendEmail (${$3})\n`;
    });

    code = code.replace(/(send file to)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.sendFileTo (step, ${$3})\n`;
    });

    code = code.replace(/(hover)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.hover (step, ${$3})\n`;
    });

    code = code.replace(/(click link text)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.linkByText (step, ${$3})\n`;
    });

    code = code.replace(/(click)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.click (step, ${$3})\n`;
    });

    code = code.replace(/(send file)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await dk.sendFile (step, ${$3})\n`;
    });

    code = code.replace(/(copy)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.copyFile(${$3})\n`;
    });

    code = code.replace(/(convert)(\s*)(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.convert(${$3})\n`;
    });

    // TODO: AS CHART.
    // code = code.replace(/(\w+)\s*\=\s*(.*)\s*as chart/gi, ($0, $1, $2) => {
    //   return `${$1} = await sys.asImage(${$2})\n`;
    // });

    code = code.replace(/MERGE\s(.*)\sWITH\s(.*)BY\s(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.merge(${$1}, ${$2}, ${$3})\n`;
    });

    code = code.replace(/PRESS\s(.*)\sON\s(.*)/gi, ($0, $1, $2) => {
      return `await dk.pressKey(step, ${$2}, ${$1})\n`;
    });

    code = code.replace(/SCREENSHOT\s(.*)/gi, ($0, $1, $2) => {
      return `await dk.screenshot(step, ${$1})\n`;
    });

    code = code.replace(/TWEET\s(.*)/gi, ($0, $1, $2) => {
      return `await sys.tweet(step, ${$1})\n`;
    });

    code = code.replace(/(\w+)\s*\=\s*(.*)\s*as image/gi, ($0, $1, $2) => {
      return `${$1} = await sys.asImage(${$2})\n`;
    });

    code = code.replace(/(\w+)\s*\=\s*(.*)\s*as pdf/gi, ($0, $1, $2) => {
      return `${$1} = await sys.asPdf(${$2})\n`;
    });

    code = code.replace(/(\w+)\s*\=\s*FILL\s(.*)\sWITH\s(.*)/gi, ($0, $1, $2, $3) => {
      return `${1} = await sys.fill(${$2}, ${$3})\n`;
    });

    code = code.replace(/save\s(.*)\sas\s(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.saveFile(${$2}, ${$1})\n`;
    });
    code = code.replace(/(save)(\s)(.*)/gi, ($0, $1, $2, $3) => {
      return `await sys.save(${$3})\n`;
    });

    code = code.replace(/set\s(.*)/gi, ($0, $1, $2) => {
      return `await sys.set (${$1})`;
    });

    code = `${code}\n%>`;

    return code;
  }

  public async translateBASIC(filename: any, min: GBMinInstance, deployer: GBDeployer, mainName: string) {

    // Converts General Bots BASIC into regular VBS

    let basicCode: string = fs.readFileSync(filename, 'utf8');

    // Processes END keyword, removing extracode, useful
    // for development.

    let end = /(\nend\n)/gi.exec(basicCode);
    if (end) {
      basicCode = basicCode.substring(0, end.index);
    }

    // Removes comments.

    basicCode = basicCode.replace(/((^|\W)REM.*\n)/gi, '');

    // Process INCLUDE keyword to include another
    // dialog inside the dialog.

    let include = null;
    do {
      include = /^include\b(.*)$/gmi.exec(basicCode);

      if (include) {
        let includeName = include[1].trim();
        includeName = Path.join(Path.dirname(filename), includeName);
        includeName = includeName.substr(0, includeName.lastIndexOf(".")) + ".vbs";

        // To use include, two /publish will be necessary (for now)
        // because of alphabet order may raise not found errors.

        let includeCode: string = fs.readFileSync(includeName, 'utf8');
        basicCode = basicCode.replace(/^include\b.*$/gmi, includeCode);
      }
    } while (include);

    const vbsCode = this.convertGBASICToVBS(min, basicCode);
    const vbsFile = `${filename}.compiled`;
    fs.writeFileSync(vbsFile, vbsCode);

    // Converts VBS into TS.

    vb2ts.convertFile(vbsFile);

    // Convert TS into JS.

    const tsfile: string = `${filename}.ts`;
    let tsCode: string = fs.readFileSync(tsfile, 'utf8');
    tsCode = tsCode + `let resolve;`;
    fs.writeFileSync(tsfile, tsCode);
    const tsc = new TSCompiler();
    tsc.compile([tsfile]);

    // Run JS into the GB context.

    const jsfile = `${tsfile}.js`.replace('.ts', '');

    if (fs.existsSync(jsfile)) {
      let code: string = fs.readFileSync(jsfile, 'utf8');

      code = code.replace(/^.*exports.*$/gm, '');

      code = `

      return (async () => {
        require('isomorphic-fetch);
        const rest = require ('typescript-rest-rpc/lib/client');

        // Interprocess communication from local HTTP to the BotServer.

        dk = rest.createClient('http://localhost:1111/api/v2/${min.botId}/dialog');
        sys = rest.createClient('http://localhost:1111/api/v2/${min.botId}/system');
                
        // Local variables.

        gb = dk.getSingleton(url);
        const id = gb.id;
        const username = gb.username;
        const mobile = gb.mobile;
        const from = gb.from;
        const ENTER = gb.ENTER;
        const headers = gb.headers;
        const data = gb.data;
        const list = gb.list;
        const httpUsername = gb.httpUsername;
        const httpPs = gb.httpPs;
    
        // Local functions.

        const ubound = (array) => {return array.length};
        const isarray = (array) => {return Array.isArray(array) };
    
        // Remote functions.
        
        const weekday = (v) => { (async () => { await client.getWeekFromDate(v) })(); };
        const hour = (v) => { (async () => { await client.getHourFromDate(v) })(); };
        const base64 =  (v) => { (async () => { await client.getCoded(v) })(); };
        const tolist =  (v) => { (async () => { await client.getToLst(v) })(); };
        const now =  (v) => { (async () => { await client.getNow(v) })(); };
        const today =  (v) => { (async () => { await client.getToday(v) })(); };

        ${code}

      })(); 
    
  `;
      // Finds all hear calls.

      const parsedCode = beautify(code, { indent_size: 2, space_in_empty_paren: true });
      fs.writeFileSync(jsfile, parsedCode);

      min.sandBoxMap[mainName.toLowerCase().trim()] = parsedCode;

      GBLog.info(`[GBVMService] Finished loading of ${filename}, JavaScript from Word: \n ${parsedCode}`);
    }
  }


  /**
   * Executes the converted JavaScript from BASIC code inside execution context.
   */
  public static async callVM(text: string, min: GBMinInstance, step: GBDialogStep, deployer: GBDeployer) {

    // Creates a class DialogKeywords which is the *this* pointer
    // in BASIC.

    const user = step ? await min.userProfile.get(step.context, {}) : null;

    const sandbox = { user: user.ssystemUser };

    const contentLocale = min.core.getParam<string>(
      min.instance,
      'Default Content Language',
      GBConfigService.get('DEFAULT_CONTENT_LANGUAGE')
    );

    // Auto-NLP generates BASIC variables related to entities.

    if (step && step.context.activity['originalText']) {
      const entities = await min["nerEngine"].findEntities(
        step.context.activity['originalText'],
        contentLocale);

      for (let i = 0; i < entities.length; i++) {
        const v = entities[i];
        const variableName = `${v.entity}`;
        sandbox[variableName] = v.option;
      }
    }

    const botId = min.botId;
    const gbdialogPath = urlJoin(process.cwd(), 'work', `${botId}.gbai`, `${botId}.gbdialog`);
    const scriptPath = urlJoin(gbdialogPath, `${text}.js`);

    let code = min.sandBoxMap[text];

    if (GBConfigService.get('VM3') === 'true') {
      try {

        const vm1 = new NodeVM({
          allowAsync: true,
          sandbox: {},
          console: 'inherit',
          wrapper: 'commonjs',
          require: {
            builtin: ['stream', 'http', 'https', 'url', 'zlib'],
            root: ['./'],
            external: true,
            context: 'sandbox'
          },
        });
        const s = new VMScript(code, { filename: scriptPath });
        let x = vm1.run(s);
        return x;
      } catch (error) {
        throw new Error(`BASIC RUNTIME ERR: ${error.message ? error.message : error}\n Stack:${error.stack}`);
      }

    } else {
      const runnerPath = urlJoin(process.cwd(), 'dist', 'packages', 'basic.gblib', 'services', 'vm2-process', 'vm2ProcessRunner.js');

      try {
        const { run, drain } = createVm2Pool({
          min: 1,
          max: 1,
          cpu: 100,
          memory: 50000,
          time: 60 * 60 * 24 * 14,
          cwd: gbdialogPath,
          script: runnerPath
        });

        const result = await run(code, { filename: scriptPath, sandbox: sandbox });

        drain();
        return result;
      } catch (error) {
        throw new Error(`BASIC RUNTIME ERR: ${error.message ? error.message : error}\n Stack:${error.stack}`);
      }
    }
  }
}
