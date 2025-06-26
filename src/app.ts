import express, {Router} from 'express';
const router = Router();
const app = express();
router.get('/healthcheck', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
app.use(express.json());
