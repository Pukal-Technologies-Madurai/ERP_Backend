import express from 'express';
import topics from '../controller/DiscussionForem/discussionTopics.mjs';
import chats from '../controller/DiscussionForem/chats.mjs';

const TopicsRouter = express.Router();

TopicsRouter.get('/discussionTopic', topics.getTopics);
TopicsRouter.post('/discussionTopic', topics.createTopics);
TopicsRouter.put('/discussionTopic', topics.updateTopics);
TopicsRouter.delete('/discussionTopic', topics.deleteTopics);


TopicsRouter.get('/messages', chats.getTopicMessages);
TopicsRouter.post('/messages', chats.postMessages);

TopicsRouter.post('/modifyTeam', chats.postTeamMembers);

TopicsRouter.get('/files', chats.documentsListForTopic)
TopicsRouter.post('/files', chats.uploadFile);
TopicsRouter.get('/files/download', chats.downloadDocument);



export default TopicsRouter;