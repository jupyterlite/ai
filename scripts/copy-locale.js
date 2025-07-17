#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths
const sourcePath = path.join(__dirname, '..', 'locale');
const targetPath = path.join(__dirname, '..', 'jupyterlite_ai', 'labextension', 'locale');

// Function to copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const files = fs.readdirSync(src);
  
  files.forEach(file => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    
    if (fs.statSync(srcFile).isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}

// Copy locale files
if (fs.existsSync(sourcePath)) {
  console.log('Copying locale files...');
  copyDir(sourcePath, targetPath);
  console.log('✅ Locale files copied successfully');
} else {
  console.log('❌ Source locale directory not found');
}