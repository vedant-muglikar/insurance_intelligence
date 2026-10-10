/** @type {import('next').NextConfig} */

// Runtime data files the OCR pipeline loads from disk (not via import), so
// output file tracing must be told about them for production deployments.
const OCR_RUNTIME_FILES = [
  './node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*',
  './node_modules/tesseract.js/src/**/*',
  './node_modules/tesseract.js-core/**/*',
  './node_modules/pdfjs-dist/legacy/build/**/*',
  './node_modules/pdfjs-dist/standard_fonts/**/*',
  './node_modules/pdfjs-dist/cmaps/**/*',
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Native / worker-thread based packages must run from node_modules, unbundled
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'tesseract.js', '@napi-rs/canvas', 'sharp'],
  outputFileTracingIncludes: {
    '/api/policy/analyze': OCR_RUNTIME_FILES,
    '/api/bill/analyze': OCR_RUNTIME_FILES,
    '/api/quote/analyze': OCR_RUNTIME_FILES,
  },
}

export default nextConfig
