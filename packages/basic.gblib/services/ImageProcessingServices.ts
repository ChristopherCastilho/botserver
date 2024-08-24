/*****************************************************************************\
|  █████  █████ ██    █ █████ █████   ████  ██      ████   █████ █████  ███ ® |
| ██      █     ███   █ █     ██  ██ ██  ██ ██      ██  █ ██   ██  █   █      |
| ██  ███ ████  █ ██  █ ████  █████  ██████ ██      ████   █   █   █    ██    |
| ██   ██ █     █  ██ █ █     ██  ██ ██  ██ ██      ██  █ ██   ██  █      █   |
|  █████  █████ █   ███ █████ ██  ██ ██  ██ █████   ████   █████   █   ███    |
|                                                                             |
| General Bots Copyright (c) pragmatismo.cloud. All rights reserved.          |
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
| "General Bots" is a registered trademark of pragmatismo.cloud.              |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

'use strict';

import Path from 'path';
import { GBLog, GBMinInstance } from 'botlib';
import { DialogKeywords } from './DialogKeywords.js';
import joinImages from 'join-images-updated';
import { CollectionUtil } from 'pragmatismo-io-framework';
import { GBAdminService } from '../../admin.gbapp/services/GBAdminService.js';
import urlJoin from 'url-join';
import { GBServer } from '../../../src/app.js';
import { GBLogEx } from '../../core.gbapp/services/GBLogEx.js';

/**
 * Image processing services of conversation to be called by BASIC.
 */
export class ImageProcessingServices {
  /**
   * Sharpen the image.
   *
   * @example file = SHARPEN file
   */
  public async sharpen({ pid, file: file }) {
    const { min, user } = await DialogKeywords.getProcessInfo(pid);
    GBLogEx.info(min, `Image Processing SHARPEN ${file}.`);

    const gbfile = DialogKeywords.getFileByHandle(file);

    // TODO: sharp.
    return;
  }

  /**
   * SET ORIENTATION VERTICAL
   * 
   * file = MERGE file1, file2, file3 
   */
  public async mergeImage({pid, files})
  {
    const { min, user } = await DialogKeywords.getProcessInfo(pid);

    let paths = [];
    await CollectionUtil.asyncForEach(files, async file => {
      const gbfile = DialogKeywords.getFileByHandle(file);  
      paths.push(gbfile.path);
    });

    const botId = min.instance.botId;
    const path = DialogKeywords.getGBAIPath(min.botId);
    const img = await joinImages(paths);
    const localName = Path.join('work', path, 'cache', `img-mrg${GBAdminService.getRndReadableIdentifier()}.png`);
    const url = urlJoin(GBServer.globals.publicAddress, min.botId, 'cache', Path.basename(localName));
    img.toFile(localName);

    return { localName: localName, url: url, data: null };

  }

  /**
   * Sharpen the image.
   *
   * @example file = BLUR file
   */
   public async blur({ pid, file: file }) {
    const { min, user } = await DialogKeywords.getProcessInfo(pid);
    GBLogEx.info(min, `Image Processing SHARPEN ${file}.`);

    const gbfile = DialogKeywords.getFileByHandle(file);
    const data = await sharp(gbfile.data)
      .blur()
      .toBuffer();

    const newFile = {
      filename: gbfile.filename,
      data: data
    };
    return;
  }

}
