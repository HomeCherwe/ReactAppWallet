import React from 'react'
import Svg, { Circle, Path } from 'react-native-svg'

// Stroke icons (Lucide-style, 24×24). Plain SVG so they work in OTA updates without native modules.
const PATHS = {
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  sync: ['M3 12a9 9 0 0 1 15.74-5.26L21 9', 'M21 3v6h-6', 'M21 12a9 9 0 0 1-15.74 5.26L3 15', 'M3 21v-6h6'],
  key: ['M21 2l-9.6 9.6', 'M15.5 7.5l3 3L22 7l-3-3'],
  unplug: [
    'M19 5l3-3',
    'M2 22l3-3',
    'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4z',
    'M7.5 13.5L10 11',
    'M10.5 16.5L13 14',
    'M12 6l6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0z',
  ],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  plus: ['M12 5v14', 'M5 12h14'],
  pin: [
    'M12 17v5',
    'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
  ],
  pinOff: ['M12 17v5', 'M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89', 'M2 2l20 20', 'M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11'],
  split: ['M16 3h5v5', 'M8 3H3v5', 'M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3', 'M15 9l6-6'],
  tag: ['M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.71a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z', 'M7.5 7.5h.01'],
  search: ['M21 21l-4.3-4.3'],
  card: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M2 10h20'],
  archive: ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4'],
  chart: ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  chevronDown: ['M6 9l6 6 6-6'],
  sparkles: [
    'M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z',
    'M20 3v4',
    'M22 5h-4',
    'M4 17v2',
    'M5 18H3',
  ],
  arrowUp: ['M5 12l7-7 7 7', 'M12 19V5'],
  tapHand: ['M9 11V5a2 2 0 0 1 4 0v6', 'M13 10V8a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5.2-3L3 14.5a2 2 0 0 1 3.4-2L9 15'],
} as const

export type IconName = keyof typeof PATHS

export default function Icon({
  name,
  size = 20,
  color = '#fff',
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'key' && <Circle cx={7.5} cy={15.5} r={5.5} stroke={color} strokeWidth={strokeWidth} />}
      {name === 'search' && <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={strokeWidth} />}
      {PATHS[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  )
}
