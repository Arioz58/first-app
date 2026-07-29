import QRCode from 'qrcode';
import { View } from 'react-native';

// QR code rendu en pur JS (aucun module natif). La matrice est produite par la
// lib `qrcode`, puis dessinée en regroupant les modules sombres de chaque ligne
// en segments → beaucoup moins de Views qu'un carré par module.
// Fond blanc fixe (même en dark) : les scanners attendent du noir sur blanc.
export default function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  let matrix: { size: number; data: Uint8Array } | null = null;
  try {
    matrix = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
  } catch {
    matrix = null;
  }
  if (!matrix) return <View style={{ width: size, height: size, backgroundColor: '#fff' }} />;

  const count = matrix.size;
  const QUIET = 10; // marge blanche autour (quiet zone)
  const cell = (size - QUIET * 2) / count;

  const segments: { x: number; y: number; w: number }[] = [];
  for (let r = 0; r < count; r++) {
    let col = 0;
    while (col < count) {
      if (matrix.data[r * count + col]) {
        const start = col;
        while (col < count && matrix.data[r * count + col]) col++;
        segments.push({ x: QUIET + start * cell, y: QUIET + r * cell, w: (col - start) * cell });
      } else {
        col++;
      }
    }
  }

  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius: 12 }}>
      {segments.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.w,
            height: cell,
            backgroundColor: '#000',
          }}
        />
      ))}
    </View>
  );
}
