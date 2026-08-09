/** @type {import('tailwindcss').Config} */
const {
  default: flattenColorPalette,
} = require('tailwindcss/lib/util/flattenColorPalette');
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        retro: ['RetroPixel', 'Courier New', 'monospace'],
        supercell: ['SupercellMagic', 'Arial', 'sans-serif'],
        mono: ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [
    function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          'game-pixel-container-clickable': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/pixel_style/container_pixel_clickable.png")',
              'border-image-slice': '12 12 18 12 fill',
              'border-image-width': '12px 12px 18px 12px',
              'border-image-repeat': 'stretch',
              'border-image-outset': '0px 0px 6px 0px !important',
              'margin-bottom': '6px !important',
              'box-shadow': `0px 6px ${value} !important`,
              'background-color': value,
              'clip-path': 'var(--pixel-container-clickable-clip-path)',
              'min-width': '48px !important',
              'min-height': '48px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-pixel-container': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/pixel_style/container_pixel.png")',
              'border-image-slice': '12 fill',
              'border-image-width': '12px',
              'border-image-repeat': 'stretch',
              'clip-path': 'var(--pixel-container-clip-path)',
              'background-color': value,
              'min-width': '48px !important',
              'min-height': '48px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-pixel-container-slot': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/pixel_style/container_pixel_slot.png")',
              'border-image-slice': '12 fill',
              'border-image-width': '12px',
              'border-image-repeat': 'stretch',
              'clip-path': 'var(--pixel-container-slot-clip-path)',
              'background-color': value,
              'min-width': '24px !important',
              'min-height': '24px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-pixel-container-progress-fill': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/pixel_style/container_pixel_progress_fill.png")',
              'border-image-slice': '6 fill',
              'border-image-width': '6px',
              'border-image-repeat': 'stretch',
              'clip-path': 'var(--pixel-container-progress-fill-clip-path)',
              'background-color': value,
              'min-width': '18px !important',
              'min-height': '18px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/3d_style/container_3d.png")',
              'border-image-slice': '36 36 45 36 fill !important',
              'border-image-width': '12px 12px 15px 12px !important',
              'border-image-repeat': 'stretch !important',
              'border-image-outset': '0px 0px 3px 0px !important',
              'clip-path':
                'rect(0px 100% calc(100% + 3px) 0px round 12px) !important',
              'background-color': value,
              'box-shadow': `0px 3px ${value} !important`,
              'margin-bottom': '3px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container-clickable': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/3d_style/container_3d_clickable.png")',
              'border-image-slice': '42 42 60 42 fill !important',
              'border-image-width': '14px 14px 20px 14px !important',
              'border-image-repeat': 'stretch !important',
              'border-image-outset': '0px 0px 6px 0px !important',
              'clip-path':
                'rect(0px 100% calc(100% + 6px) 0px round 12px) !important',
              'box-shadow': `0px 6px ${value} !important`,
              'background-color': value,
              'margin-bottom': '6px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container-slot': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/3d_style/container_3d_slot.png")',
              'border-image-slice': '36 fill !important',
              'border-image-width': '12px !important',
              'border-image-repeat': 'stretch !important',
              'clip-path': 'rect(0px 100% 100% 0px round 12px) !important',
              'background-color': value,
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container-progress-fill': (value) => {
            return {
              'border-image-source':
                'url("/assets/ui/3d_style/container_3d_progress_fill.png")',
              'border-image-slice': '42 fill !important',
              'border-image-width': '14px !important',
              'border-image-repeat': 'stretch !important',
              'clip-path': 'rect(0px 100% 100% 0px round 12px) !important',
              'background-color': value,
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );
    },
  ],
};
