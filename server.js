const http = require('http');
const https = require('https');
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

// 구글 스프레드시트 실시간 데이터 전송용 비동기 HTTP POST 헬퍼 (Redirect 대응)
function postToGoogleSheet(payloadObj) {
    const targetUrl = 'https://script.google.com/macros/s/AKfycbx7Rp0eSIJBEeX5BbParZ98D65Jf9aPUukOrvPxtJemXcc5PrpdkCkgiHs3gpFJlY_snQ/exec';
    const payload = JSON.stringify(payloadObj);

    function performRequest(urlToPost) {
        try {
            const urlObj = new URL(urlToPost);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, (res) => {
                // 301, 302 리디렉션 응답인 경우 location 헤더를 추적하여 재귀 호출
                if (res.statusCode === 302 || res.statusCode === 301) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        performRequest(redirectUrl);
                        return;
                    }
                }
            });

            req.on('error', (err) => {
                console.error('구글 스프레드시트 데이터 전송 오류:', err.message);
            });

            req.write(payload);
            req.end();
        } catch (err) {
            console.error('구글 스프레드시트 URL 파싱 오류:', err.message);
        }
    }

    performRequest(targetUrl);
}

// A simple execution queue to prevent race conditions during concurrent CSV reads/writes
const csvQueue = [];
let isProcessingQueue = false;

function processQueue() {
    if (isProcessingQueue || csvQueue.length === 0) return;
    isProcessingQueue = true;
    
    const task = csvQueue.shift();
    task()
        .then(() => {
            isProcessingQueue = false;
            processQueue();
        })
        .catch(err => {
            console.error('CSV Queue error:', err);
            isProcessingQueue = false;
            processQueue();
        });
}

function queueCsvOperation(opFn) {
    return new Promise((resolve, reject) => {
        csvQueue.push(() => {
            return opFn().then(resolve).catch(reject);
        });
        processQueue();
    });
}

const server = http.createServer((req, res) => {
    // Helper to get products dynamically
    function getProducts() {
        return new Promise((resolve, reject) => {
            const assetsDir = path.join(__dirname, 'assets');
            fs.readdir(assetsDir, (err, files) => {
                if (err) return reject(err);
                
                const images = files.filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext);
                    const isNotBg = !file.toLowerCase().includes('bg') && !file.toLowerCase().includes('event');
                    return isImage && isNotBg;
                });

                const products = images.map((file) => {
                    const nameWithoutExt = path.basename(file, path.extname(file));
                    const lowerName = nameWithoutExt.toLowerCase();
                    
                    let category = 'etc';
                    let categoryLabel = '기타';
                    
                    if (lowerName.startsWith('hd')) { category = 'headphone'; categoryLabel = '헤드폰'; }
                    else if (lowerName.startsWith('er')) { category = 'earbud'; categoryLabel = '이어버드'; }
                    else if (lowerName.startsWith('sp')) { category = 'speaker'; categoryLabel = '스피커'; }

                    const numMatch = nameWithoutExt.match(/\d+/);
                    const number = numMatch ? parseInt(numMatch[0]) : 1;
                    
                    let label = nameWithoutExt, title = nameWithoutExt, rank = '스페셜 경품! 🎁';

                    if (category === 'headphone') {
                        if (number >= 1 && number <= 5) { label = '울트라 헤드폰 2세대'; title = '울트라 헤드폰 2세대'; }
                        else { label = `Bose Headphone ${number}`; title = `QuietComfort Headphone ${number}`; }
                        rank = '1등 대박 경품 획득! 🏆';
                    } else if (category === 'earbud') {
                        if (number >= 1 && number <= 5) { label = 'QC 울트라 이어버드 2세대'; title = 'QC 울트라 이어버드 2세대'; }
                        else if (number >= 6 && number <= 14) { label = '울트라 오픈 이어버드'; title = '울트라 오픈 이어버드'; }
                        else { label = `Bose Earbud ${number}`; title = `QuietComfort Earbud ${number}`; }
                        rank = '2등 최고 경품 획득! 🌟';
                    } else if (category === 'speaker') {
                        if (number >= 1 && number <= 6) { label = '마이크로 스피커 2세대'; title = '마이크로 스피커 2세대'; }
                        else { label = `Bose Speaker ${number}`; title = `SoundLink Speaker ${number}`; }
                        rank = '3등 감동 경품 획득! ✨';
                    }

                    return {
                        id: nameWithoutExt, category, categoryLabel, label, img: `./assets/${file}`, rank, title,
                        desc: `축하드립니다! 대표님의 완벽한 슬롯 매칭으로 보스 명작 [${title}] 경품의 주인공이 되셨습니다! 스토어 알림 동의가 완료되면 전용 배송 등록 처리가 개시됩니다!`
                    };
                });
                resolve(products);
            });
        });
    }

    // API endpoint to dynamically scan assets folder for product images
    if (req.url === '/api/products') {
        getProducts().then(products => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(products));
        }).catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: err.message }));
        });
        return;
    }

    // [보안 고도화] 어뷰징 방지: 서버사이드 당첨 확률 로직 이전
    if (req.url === '/api/spin' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const naverId = data.naverId || 'unknown';
                
                if (!global.userSessions) global.userSessions = {};
                if (!global.userSessions[naverId]) global.userSessions[naverId] = { spinsDone: 0 };
                global.userSessions[naverId].spinsDone++;
                
                const spinsDone = global.userSessions[naverId].spinsDone;
                const spinNumber = ((spinsDone - 1) % 3) + 1; 

                const SPIN_PROBABILITIES = { 1: 0.005, 2: 0.01, 3: 0.02, 4: 0.03, 5: 0.935 };
                const MARKETING_PROGRESSIVE_MODE = true;
                const PROGRESSIVE_OUTCOMES = { 1: [5, 4], 2: [4, 3], 3: [1, 2, 3] };

                let winningTier = 5;
                if (MARKETING_PROGRESSIVE_MODE && PROGRESSIVE_OUTCOMES[spinNumber]) {
                    const possibleTiers = PROGRESSIVE_OUTCOMES[spinNumber];
                    winningTier = possibleTiers[Math.floor(Math.random() * possibleTiers.length)];
                } else {
                    const totalWeight = Object.values(SPIN_PROBABILITIES).reduce((a, b) => a + b, 0);
                    let rand = Math.random() * totalWeight;
                    for (const [tier, weight] of Object.entries(SPIN_PROBABILITIES)) {
                        rand -= weight;
                        if (rand <= 0) { winningTier = parseInt(tier); break; }
                    }
                }

                const ITEMS = await getProducts();
                const headphones = ITEMS.filter(item => item.category === 'headphone');
                const earbuds = ITEMS.filter(item => item.category === 'earbud');
                const speakers = ITEMS.filter(item => item.category === 'speaker');

                let item1, item2, item3;
                switch (winningTier) {
                    case 1:
                        const luckyHD = headphones[Math.floor(Math.random() * headphones.length)] || ITEMS[0];
                        item1 = item2 = item3 = luckyHD; break;
                    case 2:
                        const luckyER = earbuds[Math.floor(Math.random() * earbuds.length)] || ITEMS[0];
                        item1 = item2 = item3 = luckyER; break;
                    case 3:
                        const luckySP = speakers[Math.floor(Math.random() * speakers.length)] || ITEMS[0];
                        item1 = item2 = item3 = luckySP; break;
                    case 4:
                        const validCategories = [];
                        if (headphones.length >= 2) validCategories.push('headphone');
                        if (earbuds.length >= 2) validCategories.push('earbud');
                        if (speakers.length >= 2) validCategories.push('speaker');
                        const chosenCat = validCategories.length > 0 ? validCategories[Math.floor(Math.random() * validCategories.length)] : 'headphone';
                        const catItems = ITEMS.filter(item => item.category === chosenCat);
                        const shuffled = [...catItems].sort(() => 0.5 - Math.random());
                        item1 = shuffled[0]; item2 = shuffled[1] || shuffled[0]; item3 = shuffled[2] || shuffled[0];
                        if (item1.id === item2.id && item2.id === item3.id && catItems.length >= 2) {
                            const alternate = catItems.find(item => item.id !== item1.id);
                            if (alternate) item3 = alternate;
                        }
                        break;
                    case 5:
                    default:
                        let tries = 0;
                        do {
                            item1 = ITEMS[Math.floor(Math.random() * ITEMS.length)];
                            item2 = ITEMS[Math.floor(Math.random() * ITEMS.length)];
                            item3 = ITEMS[Math.floor(Math.random() * ITEMS.length)];
                            tries++;
                        } while (((item1.id === item2.id && item2.id === item3.id) || (item1.category === item2.category && item2.category === item3.category)) && tries < 50);
                        break;
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ winningTier, item1, item2, item3 }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // [대표님 관리자 대시보드 통계 전용 API]
    if (req.url === '/api/admin/stats-secret-9988' && req.method === 'GET') {
        const logFile = path.join(__dirname, 'participation_logs.csv');
        let stats = { totalParticipants: 0, totalSpins: 0, prizes: {} };
        if (fs.existsSync(logFile)) {
            const lines = fs.readFileSync(logFile, 'utf-8').split('\n');
            stats.totalParticipants = Math.max(0, lines.length - 2); // 헤더 제외
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length >= 4) {
                    const prize = cols[3].replace(/"/g, '').trim();
                    if (prize && prize !== '대기중 (스핀 미진행)') {
                        stats.totalSpins++;
                        stats.prizes[prize] = (stats.prizes[prize] || 0) + 1;
                    }
                }
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(stats));
        return;
    }

    // API endpoint to log Naver ID linkage records in a local CSV file (CRM Excel compatible)
    if (req.url === '/api/log-participation' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            // Queue the entire CSV operation to completely prevent concurrent race conditions!
            queueCsvOperation(async () => {
                try {
                    const data = JSON.parse(body);
                    const naverId = (data.naverId || 'unknown').replace(/,/g, '').replace(/\s/g, '').trim();
                    const action = data.action || 'init'; // 'init', 'spin', or 'info'
                    
                    // 한국 시간대 포맷팅 적용 (KST: UTC +9)
                    const now = new Date();
                    const kstOffset = 9 * 60 * 60 * 1000;
                    const kstDate = new Date(now.getTime() + kstOffset);
                    const formattedTime = kstDate.toISOString().replace('T', ' ').substring(0, 19);

                    const logFile = path.join(__dirname, 'participation_logs.csv');
                    
                    // 1. 만약 CSV 파일이 없으면 Excel 친화적인 UTF-8 BOM 헤더를 작성합니다 (A~D열 전체 로그, G~I열 당첨자 정보 분리).
                    if (!fs.existsSync(logFile)) {
                        fs.writeFileSync(logFile, '\uFEFF참여 일시,네이버 아이디,무료스핀 지급량,당첨 순위,,,당첨자 아이디,당첨자 성함,당첨자 연락처\n', 'utf-8');
                    }
                    
                    let fileContent = fs.readFileSync(logFile, 'utf-8');
                    let lines = fileContent.split('\n');
                    let foundIndex = -1;
                    
                    // 중복 아이디 또는 기참여 아이디 검색
                    for (let i = 1; i < lines.length; i++) {
                        const columns = lines[i].split(',');
                        if (columns.length >= 2) {
                            const existingId = columns[1].replace(/"/g, '').trim().toLowerCase();
                            if (existingId === naverId.trim().toLowerCase()) {
                                foundIndex = i;
                                break;
                            }
                        }
                    }
                    
                    // 'init' 단계에서의 중복 차단 검사
                    if (action === 'init' && foundIndex !== -1) {
                        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: 'duplicate', 
                            message: '이미 이벤트 참여 기회를 획득하신 네이버 아이디입니다! (중복 참여 불가)' 
                        }));
                        return;
                    }
                    
                    let prize = data.prize || '';
                    
                    // 2. CSV 파일 데이터 갱신 및 기록
                    if (action === 'init') {
                        if (foundIndex === -1) {
                            // [참여시간, 아이디, 지급량, 당첨순위, 빈칸1, 빈칸2, 당첨자아이디, 성함, 연락처]
                            const newLine = `"${formattedTime}","${naverId}",1,"대기중 (스핀 미진행)","","","","",""\n`;
                            fs.appendFileSync(logFile, newLine, 'utf-8');
                        }
                    } else if (action === 'spin') {
                        const actualPrize = prize || '미정';
                        if (foundIndex !== -1) {
                            const cols = lines[foundIndex].split(',');
                            // 9개 열 구조 보장
                            while (cols.length < 9) cols.push('""');
                            cols[2] = '1';
                            cols[3] = `"${actualPrize}"`;
                            // Clean up trailing carriage returns if any safely
                            cols[8] = (cols[8] || '').replace(/\r/g, '');
                            lines[foundIndex] = cols.join(',');
                            fs.writeFileSync(logFile, lines.join('\n'), 'utf-8');
                        } else {
                            const newLine = `"${formattedTime}","${naverId}",1,"${actualPrize}","","","","",""\n`;
                            fs.appendFileSync(logFile, newLine, 'utf-8');
                        }
                    } else if (action === 'info') {
                        const name = (data.name || '').replace(/,/g, '').trim();
                        const phone = (data.phone || '').replace(/,/g, '').trim();
                        if (foundIndex !== -1) {
                            const cols = lines[foundIndex].split(',');
                            // 9개 열 구조 보장
                            while (cols.length < 9) cols.push('""');
                            
                            // 대기중이거나 비어있으면 경품 정보도 보정 기록! (TypeError 방지를 위한 안전 장치)
                            const currentPrizeVal = (cols[3] || '').replace(/"/g, '').trim();
                            if (prize && (currentPrizeVal === '대기중 (스핀 미진행)' || currentPrizeVal === '' || currentPrizeVal.includes('대기중'))) {
                                cols[3] = `"${prize}"`;
                            }
                            
                            cols[6] = `"${naverId}"`; // G열: 당첨자 아이디
                            cols[7] = `"${name}"`;    // H열: 당첨자 성함
                            cols[8] = `"${phone}"`;   // I열: 당첨자 연락처
                            
                            // Clean up trailing carriage returns if any safely
                            cols[8] = (cols[8] || '').replace(/\r/g, '');
                            
                            lines[foundIndex] = cols.join(',');
                            fs.writeFileSync(logFile, lines.join('\n'), 'utf-8');
                        } else {
                            const actualPrize = prize || '잭팟 경품';
                            const newLine = `"${formattedTime}","${naverId}",1,"${actualPrize}","","","${naverId}","${name}","${phone}"\n`;
                            fs.appendFileSync(logFile, newLine, 'utf-8');
                        }
                    }
                    
                    // 3. 📊 구글 스프레드시트 실시간 비동기 백그라운드 전송 활성화!
                    postToGoogleSheet({
                        action: action,
                        naverId: naverId,
                        prize: prize || '',
                        name: data.name || '',
                        phone: data.phone || ''
                    });
                    
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, message: 'CRM data processed successfully' }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        });
        return;
    }

    // 🔒 [관리자 전용] 엑셀(CSV) 참여 기록 비공개 즉시 다운로드 보안 API
    if (req.url === '/api/download-crm-logs-secret-9988' && req.method === 'GET') {
        const logFile = path.join(__dirname, 'participation_logs.csv');
        if (fs.existsSync(logFile)) {
            res.writeHead(200, {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="bose_slot_participants.csv"'
            });
            const stream = fs.createReadStream(logFile);
            stream.pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('아직 등록된 이벤트 참여자가 존재하지 않습니다.');
        }
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
