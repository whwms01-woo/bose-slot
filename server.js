const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// MIME type mapping for premium assets and styling
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // API endpoint to dynamically scan assets folder for product images
    if (req.url === '/api/products') {
        const assetsDir = path.join(__dirname, 'assets');
        fs.readdir(assetsDir, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            
            // Filter image files, exclude event background images
            const images = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext);
                const isNotBg = !file.toLowerCase().includes('bg') && !file.toLowerCase().includes('event');
                return isImage && isNotBg;
            });

            // Map image files to dynamic slot items with precise category classification
            const products = images.map((file) => {
                const nameWithoutExt = path.basename(file, path.extname(file));
                const lowerName = nameWithoutExt.toLowerCase();
                
                let category = 'etc';
                let categoryLabel = '기타';
                
                if (lowerName.startsWith('hd')) {
                    category = 'headphone';
                    categoryLabel = '헤드폰';
                } else if (lowerName.startsWith('er')) {
                    category = 'earbud';
                    categoryLabel = '이어버드';
                } else if (lowerName.startsWith('sp')) {
                    category = 'speaker';
                    categoryLabel = '스피커';
                }

                // Extract number for pretty labeling, e.g. HD_12 -> 12
                const numMatch = nameWithoutExt.match(/\d+/);
                const number = numMatch ? numMatch[0] : '';
                
                let label = nameWithoutExt;
                let title = nameWithoutExt;
                let rank = '스페셜 경품! 🎁';

                if (category === 'headphone') {
                    label = `Bose Headphone ${number}`;
                    title = `QuietComfort Headphone ${number}`;
                    rank = '1등 대박 경품 획득! 🏆';
                } else if (category === 'earbud') {
                    label = `Bose Earbud ${number}`;
                    title = `QuietComfort Earbud ${number}`;
                    rank = '2등 최고 경품 획득! 🌟';
                } else if (category === 'speaker') {
                    label = `Bose Speaker ${number}`;
                    title = `SoundLink Speaker ${number}`;
                    rank = '3등 감동 경품 획득! ✨';
                }

                return {
                    id: nameWithoutExt,
                    category: category,
                    categoryLabel: categoryLabel,
                    label: label,
                    img: `./assets/${file}`,
                    rank: rank,
                    title: title,
                    desc: `축하드립니다! 대표님의 완벽한 슬롯 매칭으로 보스 명작 [${title}] 경품의 주인공이 되셨습니다! 스토어 알림 동의가 완료되면 전용 배송 등록 처리가 개시됩니다!`
                };
            });

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(products));
        });
        return;
    }

    // API endpoint to log Naver ID linkage records in a local CSV file (CRM Excel compatible)
    if (req.url === '/api/log-participation' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const naverId = data.naverId || 'unknown';
                
                // 한국 시간대 포맷팅 적용 (KST: UTC +9)
                const now = new Date();
                const kstOffset = 9 * 60 * 60 * 1000;
                const kstDate = new Date(now.getTime() + kstOffset);
                const formattedTime = kstDate.toISOString().replace('T', ' ').substring(0, 19);

                const logFile = path.join(__dirname, 'participation_logs.csv');
                 
                 // 만약 CSV 파일이 존재하면 중복 아이디가 있는지 정밀 검사합니다 (대소문자 구분 없음)
                 if (fs.existsSync(logFile)) {
                     const fileContent = fs.readFileSync(logFile, 'utf-8');
                     const lines = fileContent.split('\n');
                     
                     const isDuplicate = lines.some(line => {
                         const columns = line.split(',');
                         if (columns.length >= 2) {
                             // 따옴표 및 공백 제거 후 비교
                             const existingId = columns[1].replace(/"/g, '').trim().toLowerCase();
                             return existingId === naverId.trim().toLowerCase();
                         }
                         return false;
                     });
                     
                     if (isDuplicate) {
                         res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                         res.end(JSON.stringify({ 
                             success: false, 
                             error: 'duplicate', 
                             message: '이미 이벤트 참여 기회를 획득하신 네이버 아이디입니다! (중복 참여 불가)' 
                         }));
                         return;
                     }
                 }

                 // 만약 CSV 파일이 없으면 Excel 친화적인 UTF-8 BOM 헤더를 먼저 작성합니다.
                 if (!fs.existsSync(logFile)) {
                     fs.writeFileSync(logFile, '\uFEFF참여 일시,네이버 아이디,무료스핀 충전량\n', 'utf-8');
                 }
                 
                 // 로그 라인 작성 (참여일시, 네이버 아이디, 충전 1회)
                 const logLine = `"${formattedTime}","${naverId}",1\n`;
                 fs.appendFileSync(logFile, logLine, 'utf-8');
                 
                 res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                 res.end(JSON.stringify({ success: true, message: 'Participation log saved successfully' }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Default route mapping
    let requestedPath = req.url === '/' ? '/index.html' : req.url;
    
    // Decode URI to support Korean paths or spaces if any
    requestedPath = decodeURIComponent(requestedPath);
    const filePath = path.join(__dirname, requestedPath);

    // Standard security sandbox check
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Access Denied');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 Not Found - 파일이 존재하지 않습니다.</h1>', 'utf-8');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`서버 내부 에러: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

function startServer(port) {
    server.listen(port, () => {
        console.log(`\n==================================================`);
        console.log(`🔊 [BOSE SOUND SLOTS] 로컬 HTTP 서버 기동 완료!`);
        console.log(`👉 서비스 주소: http://localhost:${port}`);
        console.log(`==================================================\n`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  포트 ${port}번이 이미 사용 중입니다. 포트 ${port + 1}번으로 자동 전환합니다...`);
            startServer(port + 1);
        } else {
            console.error(`❌ 서버 기동 중 알 수 없는 에러가 발생했습니다:`, err);
        }
    });
}

startServer(PORT);
