# LyraMD Themes

Download any `.css` file and place it in `~/.lyramd/themes/`, or use **Theme > Import Theme** in LyraMD to import directly.

## Available Themes

The four built-in themes ship as standalone CSS files in this directory — use them as starting points for your own:

| Theme | Description |
|-------|-------------|
| [light.css](light.css) | GitHub-inspired clean white, the default look |
| [dark.css](dark.css) | GitHub Dark style low-light theme |
| [elegant.css](elegant.css) | Warm serif theme with terracotta accents and dark code blocks |
| [newsprint.css](newsprint.css) | Cream paper texture with serif type |

Semantic color tokens are contract-checked (`npm run check:themes`): text and link colors must keep WCAG AA contrast against each theme background, and standalone files must stay in sync with `src/renderer/themes/base.css`.

## Creating Your Own Theme

LyraMD custom themes are plain CSS files. You can style the editor by targeting CSS custom properties or writing direct selectors.

### CSS Variables

```css
body {
  --bg-color: #ffffff;
  --text-color: #24292f;
  --text-muted: #656d76;
  --border-color: #d0d7de;
  --link-color: #0969da;
  --code-bg: rgba(0,0,0,0.05);
  --code-block-bg: #f6f8fa;
  --code-block-text: #24292f;
  --blockquote-border: #d0d7de;
  --blockquote-bg: transparent;
  --table-header-bg: #f6f8fa;
  --selection-bg: rgba(0,0,0,0.1);
}
```

### Direct Selectors

For more control, target elements directly:

```css
#editor .ProseMirror { font-family: Georgia, serif; }
#editor .ProseMirror strong { color: #c44b2b; }
#editor .ProseMirror pre { background: #2c2c2c; color: #e0dcd7; }
```

### Tips

- Theme files should be self-contained (no external imports)
- Test that all variables are defined to avoid invisible text
- Name the file descriptively: `dark-ocean.css`, `solarized-light.css`, etc.
