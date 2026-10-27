const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Màn hình chào (Welcome Screen)
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(__dirname, 'screenshots', '01-welcome-screen.png') });
  console.log('Saved 01-welcome-screen.png');

  // 2. Gửi câu hỏi đầu tiên
  console.log('Clicking suggestion card: Dạy tao nấu mì tôm...');
  const card = await page.$('.suggestion-card[data-prompt="Dạy tao nấu mì tôm"]');
  if (card) {
    await card.click();
  }

  // Chờ pop-up xuất hiện
  await page.waitForSelector('#aduduModal.active', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 1500)); // Đợi stream chạy một chút

  // 3. Chụp màn hình Pop-up Adudu
  await page.screenshot({ path: path.join(__dirname, 'screenshots', '03-popup-adudu.png') });
  console.log('Saved 03-popup-adudu.png');

  // Đóng pop-up bằng phím Escape
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1200));

  // Gửi tiếp câu thứ 2 để có nhiều tin nhắn
  console.log('Sending second message...');
  await page.type('#messageInput', 'Mày có sợ Boboiboy không?');
  await page.keyboard.press('Enter');

  // Đợi pop-up lại hiện ra và đóng tiếp
  await page.waitForSelector('#aduduModal.active', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1000));

  // 2. Chụp màn hình khung chat có nhiều tin nhắn
  await page.screenshot({ path: path.join(__dirname, 'screenshots', '02-chat-messages.png') });
  console.log('Saved 02-chat-messages.png');

  // Chụp Theme Sáng
  await page.click('#btnToggleTheme');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, 'screenshots', '05-light-theme.png') });
  console.log('Saved 05-light-theme.png');

  // Chuyển lại theme tối
  await page.click('#btnToggleTheme');

  // 4. Chụp giao diện Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.click('#btnOpenMobileSidebar');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, 'screenshots', '04-mobile-drawer.png') });
  console.log('Saved 04-mobile-drawer.png');

  await browser.close();
  console.log('All screenshots completed successfully!');
}

run().catch(err => {
  console.error('Lỗi khi chụp màn hình:', err);
  process.exit(1);
});
