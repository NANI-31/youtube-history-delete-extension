// paint-worklet.js
class AmbientGlowPainter {
  static get inputProperties() {
    return ['--glow-size', '--glow-opacity', '--glow-strength'];
  }

  paint(ctx, geom, properties) {
    const sizeProp = properties.get('--glow-size');
    const opacityProp = properties.get('--glow-opacity');

    // Parse size and opacity
    let size = 96; // Fallback size (px)
    if (sizeProp) {
      const valStr = sizeProp.toString().trim();
      if (valStr.endsWith('rem')) {
        size = parseFloat(valStr) * 16;
      } else if (valStr.endsWith('px')) {
        size = parseFloat(valStr);
      } else {
        size = parseFloat(valStr) || 96;
      }
    }

    const opacity = opacityProp ? parseFloat(opacityProp.toString()) : 0.10;

    const width = geom.width;
    const height = geom.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Draw Top-Right Indigo Glow Blob
    const grad1 = ctx.createRadialGradient(width, 0, 0, width, 0, size * 1.5);
    grad1.addColorStop(0, `rgba(99, 102, 241, ${opacity})`);
    grad1.addColorStop(0.5, `rgba(99, 102, 241, ${opacity * 0.4})`);
    grad1.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(width, 0, size * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Draw Bottom-Left Red/Pink Glow Blob
    const grad2 = ctx.createRadialGradient(0, height, 0, 0, height, size * 1.5);
    grad2.addColorStop(0, `rgba(239, 68, 68, ${opacity})`);
    grad2.addColorStop(0.5, `rgba(239, 68, 68, ${opacity * 0.4})`);
    grad2.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(0, height, size * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

registerPaint('ambient-glow', AmbientGlowPainter);
