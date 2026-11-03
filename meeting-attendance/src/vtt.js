'use strict';
/* WebVTT transcript -> "Speaker: text" lines, consecutive lines by the same
   speaker merged. Handles Zoom ("Name: text") and Teams ("<v Name>text</v>"). */
function vttToText(vtt) {
  const lines = String(vtt || '').replace(/\r/g, '').split('\n');
  const out = [];
  let last = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === 'WEBVTT' || /^\d+$/.test(line) || line.includes('-->') || /^NOTE\b/.test(line)) continue;
    let speaker = '', text = line;
    const v = line.match(/^<v\s+([^>]+)>(.*?)(?:<\/v>)?$/);
    if (v) { speaker = v[1].trim(); text = v[2]; } else {
      const c = line.match(/^([^:]{1,60}):\s+(.*)$/);
      if (c) { speaker = c[1].trim(); text = c[2]; }
    }
    text = text.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    if (last && last.speaker === speaker) last.text += ' ' + text;
    else { last = { speaker, text }; out.push(last); }
  }
  return out.map((l) => (l.speaker ? l.speaker + ': ' : '') + l.text).join('\n');
}
module.exports = { vttToText };
