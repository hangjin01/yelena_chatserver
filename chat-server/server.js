const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { exec } = require('child_process');
const mongoose = require('mongoose'); //여기까진 몽고디비 연동을 위한 모듈 추가에 대한 내용

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. MongoDB 연결 설정
mongoose.connect('mongodb://localhost:27017/chatDB')
    .then(() => console.log('MongoDB 연결 성공!'))
    .catch(err => console.error('DB 연결 실패:', err)); //여기까진 몽고디비 로컬 서버 연결에 대한 내용

// 2. 채팅 메시지 스키마 및 모델 정의
const chatSchema = new mongoose.Schema({
    group: String,
    user: String,
    msg: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema); //여기까진 채팅을 저장할 DB 구조(도큐먼트) 정의에 대한 내용

// 루트 경로 설정
app.get('/', (req, res) => {
    res.set('ngrok-skip-browser-warning', '69420'); 
    res.sendFile(__dirname + '/index.html'); //여기까진 로그인 페이지 렌더링에 대한 내용
});

// 관리자 페이지 경로
app.get('/admin', (req, res) => {
    res.set('ngrok-skip-browser-warning', '69420'); 
    res.sendFile(__dirname + '/admin.html'); //여기까진 관리자 전용 페이지 렌더링에 대한 내용
});

io.on('connection', (socket) => {
    console.log('새로운 유저가 접속했습니다.');

    // [추가] 이전 채팅 기록 불러오기
    socket.on('get history', async (room) => {
        try {
            // 1. 최신 기준 50개를 가져와서 시간순으로 다시 뒤집기
            const rawHistory = await Chat.find({ group: room }).sort({ timestamp: -1 }).limit(50);
            const history = rawHistory.reverse();

            // 2. 서버 터미널(systemd 로그)에 어떤 채팅을 가져왔는지 알림(arm) 띄우기
            console.log(`[DB 알림] ${room} 방의 이전 채팅 ${history.length}개를 불러왔습니다.`);
            if (history.length > 0) {
                // 어떤 데이터인지 확인하기 위해 가장 첫 번째 메시지를 샘플로 출력
                console.log(`[DB 데이터 확인] 첫 메시지: "${history[0].msg}" (작성자: ${history[0].user})`);
            }

            // 3. 프론트엔드로 데이터 쏴주기
            socket.emit('load history', history); 
        } catch (err) {
            console.error('기록 불러오기 에러:', err);
        }
    });

    socket.on('login', (data) => {
        const { username, password } = data;

        // 리눅스 계정 비밀번호 인증
        exec(`echo "${password}" | su -c "whoami" ${username}`, (authError) => {
            if (authError) {
                socket.emit('login error', '비밀번호가 틀렸거나 유저가 존재하지 않습니다.'); 
                return;
            } //여기까진 리눅스 시스템 쉘을 통한 유저 인증 실패 처리에 대한 내용

            // 관리자 여부 확인
            if (username === 'yelena' || username === 'samuel') {
                socket.emit('admin success', { user: username }); 
                console.log(`[관리자접속] ${username}님이 관리자 모드로 로그인했습니다.`);
                return;
            } //여기까진 yelena, samuel 계정일 경우 관리자 권한 부여에 대한 내용

            // 일반 유저 그룹 확인
            exec(`groups ${username}`, (groupError, stdout) => {
                if (groupError) {
                    socket.emit('login error', '그룹 조회가 실패했습니다.'); 
                    return;
                }

                const output = stdout.replace('\n', '').split(':')[1].trim();
                const groups = output.split(' ');
                const myGroup = groups.find(g => ['skt', 'kt', 'lgt'].includes(g.toLowerCase())); //여기까진 리눅스 groups 명령어로 소속 통신사 그룹을 추출하는 내용

                if (myGroup) {
                    socket.join(myGroup);
                    socket.emit('login success', { user: username, group: myGroup }); 
                    console.log(`[인증성공] ${username} -> [${myGroup}] 그룹 입장!`);
                } else {
                    socket.emit('login error', '채팅 가능한 그룹(SKT, KT, LGT) 멤버가 아닙니다.'); 
                } //여기까진 그룹 매칭 결과에 따른 채팅방 입장 처리 및 에러 전송에 대한 내용
            });
        });
    });

    // 관리자 전용 방 입장/퇴장 이벤트
    socket.on('admin join', (room) => {
        socket.join(room); 
        console.log(`[관리자] 방 입장: ${room}`);
    }); //여기까진 관리자가 특정 그룹 방을 모니터링하기 위해 입장하는 내용

    socket.on('admin leave', (room) => {
        socket.leave(room); 
        console.log(`[관리자] 방 퇴장: ${room}`);
    }); //여기까진 관리자가 기존 모니터링 방에서 나가는 내용

    // 채팅 메시지 처리 (DB 저장 추가)
    socket.on('chat message', async (data) => {
        try {
            // DB에 저장할 새 문서 생성
            const newChat = new Chat({
                group: data.group,
                user: data.user,
                msg: data.msg
            });
            await newChat.save(); //여기까진 들어온 채팅 메시지를 MongoDB에 영구 저장하는 내용

            io.to(data.group).emit('chat message', data); //여기까진 DB 저장이 완료된 후 같은 그룹 유저들에게 메시지를 쏴주는 내용
        } catch (err) {
            console.error('메시지 DB 저장 에러:', err);
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('비밀번호 보안 인증 서버 및 DB 연동이 3000번 포트에서 구동 중입니다!'); 
}); //여기까진 서버 소켓 및 앱 실행 대기에 대한 내용
