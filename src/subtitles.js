// Subtitles and captions
// Free feature - burn subtitles into video

// Supported subtitle formats
export const SUBTITLE_FORMATS = [
  { ext: '.srt', name: 'SubRip', mime: 'text/plain' },
  { ext: '.vtt', name: 'WebVTT', mime: 'text/vtt' },
  { ext: '.ass', name: 'Advanced SubStation Alpha', mime: 'text/plain' },
  { ext: '.ssa', name: 'SubStation Alpha', mime: 'text/plain' },
];

// Subtitle style presets
export const SUBTITLE_STYLES = {
  default: {
    name: 'Default',
    fontSize: 24,
    fontColor: 'white',
    outlineColor: 'black',
    outlineWidth: 2,
    shadow: true,
    position: 'bottom',
  },
  bold: {
    name: 'Bold',
    fontSize: 28,
    fontColor: 'white',
    outlineColor: 'black',
    outlineWidth: 3,
    shadow: true,
    position: 'bottom',
  },
  minimal: {
    name: 'Minimal',
    fontSize: 20,
    fontColor: 'white',
    outlineColor: 'transparent',
    outlineWidth: 0,
    shadow: true,
    position: 'bottom',
  },
  top: {
    name: 'Top',
    fontSize: 24,
    fontColor: 'white',
    outlineColor: 'black',
    outlineWidth: 2,
    shadow: true,
    position: 'top',
  },
  middle: {
    name: 'Middle',
    fontSize: 24,
    fontColor: 'white',
    outlineColor: 'black',
    outlineWidth: 2,
    shadow: true,
    position: 'middle',
  },
};

// Burn subtitles into video
export function burnSubtitles(videoPath, subtitlePath, style = 'default') {
  const subtitleStyle = SUBTITLE_STYLES[style] || SUBTITLE_STYLES.default;
  
  // Escape special characters for FFmpeg
  const escapedSubtitle = subtitlePath.replace(/:/g, '\\:').replace(/'/g, "\\'");
  
  // Build ASS style string
  const assStyle = `FontSize=${subtitleStyle.fontSize},PrimaryColour=&H${subtitleStyle.fontColor === 'white' ? 'FFFFFF' : subtitleStyle.fontColor},OutlineColour=&H${subtitleStyle.outlineColor === 'black' ? '000000' : subtitleStyle.outlineColor},Outline=${subtitleStyle.outlineWidth},Shadow=${subtitleStyle.shadow ? 1 : 0},Alignment=${subtitleStyle.position === 'top' ? 2 : subtitleStyle.position === 'middle' ? 5 : 2}`;
  
  const filter = `subtitles='${escapedSubtitle}':force_style='${assStyle}'`;
  
  return {
    filter,
    style: subtitleStyle,
    command: [
      '-vf', filter,
      '-c:a', 'copy',
    ]
  };
}

// Extract subtitles from video
export function extractSubtitles(videoPath, outputPath) {
  return [
    '-map', '0:s:0',
    outputPath,
  ];
}

// Convert subtitle format
export function convertSubtitles(inputPath, outputPath, format) {
  const ext = SUBTITLE_FORMATS.find(f => f.ext === format)?.ext || '.srt';
  return [
    inputPath,
    outputPath.replace(/\.\w+$/, ext),
  ];
}

// Parse SRT file
export function parseSRT(content) {
  const entries = [];
  const blocks = content.trim().split(/\n\n+/);
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (timeMatch) {
        entries.push({
          index: parseInt(lines[0]),
          startTime: timeMatch.slice(1, 5),
          endTime: timeMatch.slice(5, 9),
          text: lines.slice(2).join('\n'),
        });
      }
    }
  }
  
  return entries;
}

// Generate SRT from entries
export function generateSRT(entries) {
  return entries.map((entry, index) => {
    const start = formatSRTTime(entry.startTime);
    const end = formatSRTTime(entry.endTime);
    return `${index + 1}\n${start} --> ${end}\n${entry.text}`;
  }).join('\n\n');
}

function formatSRTTime(time) {
  const [h, m, s, ms] = time;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Auto-generate captions (placeholder for future AI integration)
export function generateCaptions(videoPath) {
  // This would integrate with Whisper or similar
  return new Promise((resolve) => {
    resolve({
      success: false,
      message: 'Auto-captioning requires Whisper integration',
    });
  });
}
