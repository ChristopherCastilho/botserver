/*****************************************************************************\
|                                               ( )_  _                       |
|    _ _    _ __   _ _    __    ___ ___     _ _ | ,_)(_)  ___   ___     _     |
|   ( '_`\ ( '__)/'_` ) /'_ `\/' _ ` _ `\ /'_` )| |  | |/',__)/' v `\ /'_`\   |
|   | (_) )| |  ( (_| |( (_) || ( ) ( ) |( (_| || |_ | |\__,\| (˅) |( (_) )  |
|   | ,__/'(_)  `\__,_)`\__  |(_) (_) (_)`\__,_)`\__)(_)(____/(_) (_)`\___/'  |
|   | |                ( )_) |                                                |
|   (_)                 \___/'                                                |
|                                                                             |
| General Bots Copyright (c) Pragmatismo.io. All rights reserved.             |
| Licensed under the AGPL-3.0.                                                |
|                                                                             |
| According to our dual licensing model,this program can be used either      |
| under the terms of the GNU Affero General Public License,version 3,       |
| or under a proprietary license.                                             |
|                                                                             |
| The texts of the GNU Affero General Public License with an additional       |
| permission and of our proprietary license can be found at and               |
| in the LICENSE file you have received along with this program.              |
|                                                                             |
| This program is distributed in the hope that it will be useful,            |
| but WITHOUT ANY WARRANTY,without even the implied warranty of              |
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                |
| GNU Affero General Public License for more details.                         |
|                                                                             |
| "General Bots" is a registered trademark of Pragmatismo.io.                 |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights,title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

'use strict';

import { GBError, GBLog, GBMinInstance } from 'botlib';
import { GBServer } from '../../../src/app';
import { GBAdminService } from '../../admin.gbapp/services/GBAdminService';
import { GuaribasUser } from '../../security.gbapp/models';
import { DialogKeywords } from './DialogKeywords';
import { GBDeployer } from '../../core.gbapp/services/GBDeployer';
const Swagger = require('swagger-client');
const fs = require('fs');
import { CollectionUtil } from 'pragmatismo-io-framework';
import * as request from 'request-promise-native';

const urlJoin = require('url-join');
const Path = require('path');
const Fs = require('fs');
const url = require('url');

/**
 * Web Automation services of conversation to be called by BASIC.
 */
export class DebuggerService {
  /**
   * Reference to minimal bot instance.
   */
  public min: GBMinInstance;

  /**
   * Reference to the base system keywords functions to be called.
   */
  public dk: DialogKeywords;

  /**
   * Current user object to get BASIC properties read.
   */
  public user;

  /**
   * HTML browser for conversation over page interaction.
   */
  browser: any;

  sys: any;

  /**
   * The number used in this execution for HEAR calls (useful for SET SCHEDULE).
   */
  hrOn: string;

  userId: GuaribasUser;
  debugWeb: boolean;
  lastDebugWeb: Date;

  /**
   * SYSTEM account maxLines,when used with impersonated contexts (eg. running in SET SCHEDULE).
   */
  maxLines: number = 2000;

  conversationsMap = {};
  watermarkMap = {};
  static systemVariables = [
    'AggregateError',
    'Array',
    'ArrayBuffer',
    'Atomics',
    'BigInt',
    'BigInt64Array',
    'BigUint64Array',
    'Boolean',
    'DataView',
    'Date',
    'Error',
    'EvalError',
    'FinalizationRegistry',
    'Float32Array',
    'Float64Array',
    'Function',
    'Headers',
    'Infinity',
    'Int16Array',
    'Int32Array',
    'Int8Array',
    'Intl',
    'JSON',
    'Map',
    'Math',
    'NaN',
    'Number',
    'Object',
    'Promise',
    'Proxy',
    'RangeError',
    'ReferenceError',
    'Reflect',
    'RegExp',
    'Request',
    'Response',
    'Set',
    'SharedArrayBuffer',
    'String',
    'Symbol',
    'SyntaxError',
    'TypeError',
    'URIError',
    'Uint16Array',
    'Uint32Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'VM2_INTERNAL_STATE_DO_NOT_USE_OR_PROGRAM_WILL_FAIL',
    'WeakMap',
    'WeakRef',
    'WeakSet',
    'WebAssembly',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    '__proto__',
    'clearImmediate',
    'clearInterval',
    'clearTimeout',
    'console',
    'constructor',
    'decodeURI',
    'decodeURIComponent',
    'dss',
    'encodeURI',
    'encodeURIComponent',
    'escape',
    'eval',
    'fetch',
    'global',
    'globalThis',
    'hasOwnProperty',
    'isFinite',
    'isNaN',
    'isPrototypeOf',
    'parseFloat',
    'parseInt',
    'process',
    'propertyIsEnumerable',
    'setImmediate',
    'setInterval',
    'setTimeout',
    'toLocaleString',
    'toString',
    'undefined',
    'unescape',
    'valueOf'
  ];

  /**
   * When creating this keyword facade,a bot instance is
   * specified among the deployer service.
   */
  constructor(min: GBMinInstance, user, dk) {
    this.min = min;
    this.user = user;
    this.dk = dk;

    this.debugWeb = this.min.core.getParam<boolean>(this.min.instance, 'Debug Web Automation', false);

    const botId = min.botId;

    GBServer.globals.debuggers[botId] = {};
    GBServer.globals.debuggers[botId].state = 0;
    GBServer.globals.debuggers[botId].breaks = [];
  }

  private client;

  public async breakpoint({ botId, botApiKey, line }) {
    GBLog.info(`GBDEBUG: Enabled breakpoint for ${botId} on ${line}.`);
    GBServer.globals.debuggers[botId].breaks.push(Number.parseInt(line));
  }

  public async resume({ botId, botApiKey, force }) {
    const client = GBServer.globals.debuggers[botId].client;
    await client.Debugger.resume();
  }

  public async stop({ botId, botApiKey, force }) {
    GBServer.globals.debuggers[botId].state = 0;
    const client = GBServer.globals.debuggers[botId].client;
    await client.close();
  }

  public async step({ botId, botApiKey }) {
    if (GBServer.globals.debuggers[botId].state === 2) {
      const client = GBServer.globals.debuggers[botId].client;
      await client.stepOver();
    } else {
      throw new GBError(new Error('Invalid call to stepOver and state not being debug(2).'));
    }
  }

  public async context({ botId, botApiKey, force }) {
    const conversationId = this.conversationsMap[botId];
    let messages = [];
    if (this.client) {
      const response = await this.client.Conversations.Conversations_GetActivities({
        conversationId: conversationId,
        watermark: this.watermarkMap[botId]
      });
      this.watermarkMap[botId] = response.obj.watermark;
      let activities = response.obj.activites;

      if (activities && activities.length) {
        activities = activities.filter(m => m.from.id === botId && m.type === 'message');
        if (activities.length) {
          activities.forEach(activity => {
            messages.push({ text: activity.text });
            GBLog.info(`Debugger sending text to API: ${activity.text}`);
          });
        }
      }
    }

    let messagesText = messages.join('\n');

    return {
      state: GBServer.globals.debuggers[botId].state,
      messagesText,
      scope: GBServer.globals.debuggers[botId].scope
    };
  }

  public async debug({ botId, botApiKey, scriptName }) {
    if (GBServer.globals.debuggers[botId].state === 1) {
      throw new Error(`Cannot DEBUG an already running process. ${botId}`);
    } else if (GBServer.globals.debuggers[botId].state === 2) {
      GBLog.info(`BASIC: Releasing execution ${botId} in DEBUG mode.`);
      return await this.continueRun({ botId, botApiKey, force: false });
    } else {
      GBLog.info(`BASIC: Running ${botId} in DEBUG mode.`);

      GBServer.globals.debuggers[botId].state = 1;

      let min: GBMinInstance = GBServer.globals.minInstances.filter(p => p.instance.botId === botId)[0];

      this.client = await new Swagger({
        spec: JSON.parse(fs.readFileSync('directline-3.0.json', 'utf8')),
        usePromise: true
      });
      this.client.clientAuthorizations.add(
        'AuthorizationBotConnector',
        new Swagger.ApiKeyAuthorization('Authorization', `Bearer ${min.instance.webchatKey}`, 'header')
      );
      const response = await this.client.Conversations.Conversations_StartConversation();
      const conversationId = response.obj.conversationId;
      this.conversationsMap[botId] = conversationId;
      GBServer.globals.debugConversationId = conversationId;

      this.client.Conversations.Conversations_PostActivity({
        conversationId: conversationId,
        activity: {
          textFormat: 'plain',
          text: `/calldbg ${scriptName}`,
          type: 'message',
          from: {
            id: 'test',
            name: 'test'
          }
        }
      });
    }
  }
}
