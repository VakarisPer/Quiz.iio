'use strict';

const Layout = {
  wrap(bodyContent) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- ✅ Config FIRST -->
  <script>
    MathJax = {
      tex: {
        inlineMath: [['\\\\(', '\\\\)']],
        displayMath: [['\\\\[', '\\\\]']]
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea']
      }
    };
  <\/script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"><\/script>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
  }
};

module.exports = Layout;