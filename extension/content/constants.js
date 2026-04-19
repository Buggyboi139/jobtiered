const gradeCache = new Map();
let pendingListings =[];
let pendingDetails =[];
let batchTimer = null;
let isProcessing = false;
let retryDelay = 100;
const BATCH_SIZE = 8;
const BATCH_DELAY = 500;
const DESC_LIMIT = 3500;
const POLL_INTERVAL = 4000;
const SAVED_DESC_LIMIT = 2000;

let globalTooltip = null;
let keywordHighlightActive = false;
let resumeKeywords =[];
let lastDetailHash = '';
let lastUrl = window.location.href;
