
// 原始字符串数组函数
function w() {
  var f = ["W7dcNmoclSoLFCk7WPz7u8ohrfi", "W7JcQCo5W54tlwVcRq", "yNvUoMPZyW",
  "DCksWOJdK8oHg8kqnchcKxmDDq", "WOddR3yTWRpdJmkdstDuWOS", "mZC5nZmYCNjrDvLU",
  "oeHZCLnUyq", "ndGXotC3BKrrCKjn", "W7u6WP5OEc8WWPy", "rv1tWPGmErO",
  "v1nTDwC", "DgHLBG", "W7a6WRXVsYeqWOG", "nJCWnJbmAMneAvm",
  "bgGQASkzahTCW6v9CSor", "W4VdThJcMuxcRmkCW6mVW4K", "mZGYmZqZmfHVu05uBa",
  "ndu1ntm0muPZBg1NuG", "v0rHyMO", "WP0kg8oGW7lcUvNdQNy",
  "zmoaWRlcPWeAA8oCuq", "dmohlb7cT8oZW6JcJ0RdKW", "aZDFimk6W4D2"];
  return f;
}

// 模拟原始解码逻辑的函数
function decryptString(encodedStr) {
  // Base64解码
  function base64Decode(str) {
    const base64Chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
    let output = "";
    let chr1, chr2, chr3;
    let enc1, enc2, enc3, enc4;
    let i = 0;

    // 移除非Base64字符
    str = str.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    while (i < str.length) {
      enc1 = base64Chars.indexOf(str.charAt(i++));
      enc2 = base64Chars.indexOf(str.charAt(i++));
      enc3 = base64Chars.indexOf(str.charAt(i++));
      enc4 = base64Chars.indexOf(str.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output += String.fromCharCode(chr1);

      if (enc3 !== 64) {
        output += String.fromCharCode(chr2);
      }
      if (enc4 !== 64) {
        output += String.fromCharCode(chr3);
      }
    }

    return output;
  }

  // 转换为URL编码并解码
  function toUrlEncodedAndDecode(str) {
    let urlEncoded = "";
    for (let i = 0; i < str.length; i++) {
      urlEncoded += "%" + ("00" + str.charCodeAt(i).toString(16)).slice(-2);
    }
    try {
      return decodeURIComponent(urlEncoded);
    } catch (e) {
      return "无法解码: " + urlEncoded;
    }
  }

  try {
    // 执行完整解密流程
    const base64Decoded = base64Decode(encodedStr);
    return toUrlEncodedAndDecode(base64Decoded);
  } catch (e) {
    return "解密失败: " + e.message;
  }
}

// 计算索引偏移
const indexOffset = (-491 * 8) + (-335 * 5) + (-1 * 2099);
console.log("索引偏移值: " + indexOffset);

// 获取字符串数组
const strings = w();
console.log("字符串数组长度: " + strings.length);

// 解密所有字符串
console.log("\n所有字符串的解密结果:");
for (let i = 0; i < strings.length; i++) {
  console.log(`原始索引 ${i} (混淆代码中可能是 ${i - indexOffset}): "${strings[i]}" => "${decryptString(strings[i])}"`);
}

// 额外解密一些常见的混淆索引
console.log("\n\n一些特定索引的解密结果:");

// r(-164,-175) => -164 + 偏移值
const idx1 = -164 - indexOffset;
if (idx1 >= 0 && idx1 < strings.length) {
  console.log(`r(-164,-175) => strings[${idx1}] = "${strings[idx1]}" => "${decryptString(strings[idx1])}"`);
}

// r(-157,-169) => -157 + 偏移值
const idx2 = -157 - indexOffset;
if (idx2 >= 0 && idx2 < strings.length) {
  console.log(`r(-157,-169) => strings[${idx2}] = "${strings[idx2]}" => "${decryptString(strings[idx2])}"`);
}

// r(-171,-160) => -171 + 偏移值
const idx3 = -171 - indexOffset;
if (idx3 >= 0 && idx3 < strings.length) {
  console.log(`r(-171,-160) => strings[${idx3}] = "${strings[idx3]}" => "${decryptString(strings[idx3])}"`);
}

// N(84,86) => 根据N函数的逻辑
const idxN1 = 84 - indexOffset;
if (idxN1 >= 0 && idxN1 < strings.length) {
  console.log(`N(84,86) => strings[${idxN1}] = "${strings[idxN1]}" => "${decryptString(strings[idxN1])}"`);
}

// N(98,86) => 根据N函数的逻辑
const idxN2 = 98 - indexOffset;
if (idxN2 >= 0 && idxN2 < strings.length) {
  console.log(`N(98,86) => strings[${idxN2}] = "${strings[idxN2]}" => "${decryptString(strings[idxN2])}"`);
}

// 还可以尝试解析 Q[0]，但需要更多关于Q数组的信息
console.log("\n注意: 要解析Q[0]需要分析Q数组的混淆代码");

// 查找与url或import相关的字符串
console.log("\n\n可能与import相关的字符串:");
for (let i = 0; i < strings.length; i++) {
  const decrypted = decryptString(strings[i]);
  if (decrypted.includes("import") ||
      decrypted.includes("require") ||
      decrypted.includes("http") ||
      decrypted.includes("://") ||
      decrypted.includes(".js") ||
      decrypted.includes("module")) {
    console.log(`索引 ${i}: "${decrypted}"`);
  }
}
