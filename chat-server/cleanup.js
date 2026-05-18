const mongoose = require('mongoose');

// Mongoose 스키마 정의 (서버 코드에 있는 거랑 똑같이)
const chatSchema = new mongoose.Schema({
    group: String, user: String, msg: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

async function cleanOldChats() {
    try {
        await mongoose.connect('mongodb://localhost:27017/chatDB');
        
        // 30일 이전 날짜 계산
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 30일 이전 데이터 싹 다 지우기
        const result = await Chat.deleteMany({ timestamp: { $lt: thirtyDaysAgo } });
        
        console.log(`[${new Date().toLocaleString()}] 오래된 채팅 ${result.deletedCount}개 삭제 완료.`);
        
        process.exit(0); // 작업 끝나면 스크립트 종료
    } catch (err) {
        console.error('삭제 작업 에러:', err);
        process.exit(1);
    }
}

cleanOldChats();
