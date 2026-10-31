'use strict';
// License detection by normalized-text fingerprint. Only licenses we can positively identify from the actual license
// file at the pinned commit are "verified"; everything else stays pending. Never infers a license from a README or badge.
const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const MIT_BODY = `permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "software"), to deal in the software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, and to permit persons to whom the software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the software. the software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. in no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.`;
function normalize(text) {
  return String(text).replace(/\r/g, '').split('\n').filter((l) => !/^\s*(mit license|copyright\b|originally copyright\b)/i.test(l)).join(' ').toLowerCase().replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim();
}
function copyrightLine(text) { const ls = String(text).split('\n').map((l) => l.trim()).filter((l) => /^(originally\s+)?copyright\b/i.test(l)); return ls.length ? ls.join('; ') : null; }
// Permission matrix per license. These encode the license text, not legal advice; "conditional" means a human must clear it.
const MATRIX = {
  MIT: { devdropInternal: 'allowed', deployedWebsites: 'allowed', sourceCodeExport: 'allowed', templateResale: 'allowed', componentRedistribution: 'allowed' },
  'LicenseRef-MIT-Commons-Clause': { devdropInternal: 'allowed', deployedWebsites: 'allowed', sourceCodeExport: 'conditional', templateResale: 'denied', componentRedistribution: 'denied' },
};
function detect(text) {
  const raw = String(text || '');
  const lic = { spdx: null, verified: false, copyright: copyrightLine(raw), sha256: sha256(raw), attribution: 'Include the copyright notice and permission notice in all copies or substantial portions.' };
  if (/commons clause/i.test(raw) && normalize(raw).includes('permission is hereby granted, free of charge')) {
    lic.spdx = 'LicenseRef-MIT-Commons-Clause'; lic.verified = !!lic.copyright;
    lic.restrictions = 'Commons Clause: the components themselves may not be sold, sublicensed or redistributed (alone, in a bundle or as a ported version). Use inside an application, website or product is permitted.';
    return lic;
  }
  const n = normalize(raw);
  const body = normalize(MIT_BODY);
  if (n === body) { lic.spdx = 'MIT'; lic.verified = !!lic.copyright; }
  else if (n.startsWith(body) && n.length - body.length <= 60 && !/(commons|non-?commercial|restrict|except|provided that|prohibit|not\b)/.test(n.slice(body.length))) {
    // A stray trailing token after an otherwise exact MIT text (seen upstream): accepted, but the anomaly is recorded.
    lic.spdx = 'MIT'; lic.verified = !!lic.copyright; lic.note = `trailing non-license text ignored: "${n.slice(body.length).trim()}"`;
  }
  return lic;
}
module.exports = { detect, normalize, sha256, MATRIX, copyrightLine };
