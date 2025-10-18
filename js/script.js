class QuestTracker {
    constructor() {
        this.quests = [];
        this.userProgress = { pmcLevel: 1, prestige: 0, completedQuests: [] };
        this.currentMap = 'Any Location';
        this.currentTrader = 'Prapor';
        this.maps = [];
        this.twitchLiveUsers = {};
        this.traders = [];
        this.sortBy = 'map'; // 'map' or 'trader'
        this.viewMode = 'available'; // 'available' or 'finished'
        this.currentView = 'dashboard'; // 'dashboard', 'finished', 'rankings', or 'profile'
        this.showFutureQuests = false; // Show all future quests mode
        this.isAdmin = false; // Will be set from auth check
        this.isSaving = false; // Track if save is in progress
        this.isServerHealthy = true; // Track server health
        this.healthCheckInterval = null; // Health check timer
        this.pendingCompleteQuestId = null; // Track pending quest completion
        
        // Load saved preferences
        this.loadPreferences();
        
        this.init();
    }
    
    // Save preferences to localStorage
    savePreferences() {
        const prefs = {
            showFutureQuests: this.showFutureQuests,
            sortBy: this.sortBy,
            currentView: this.currentView,
            currentMap: this.currentMap,
            currentTrader: this.currentTrader
        };
        localStorage.setItem('kappaTrackerPrefs', JSON.stringify(prefs));
    }
    
    // Load preferences from localStorage
    loadPreferences() {
        try {
            const saved = localStorage.getItem('kappaTrackerPrefs');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.showFutureQuests = prefs.showFutureQuests || false;
                this.sortBy = prefs.sortBy || 'map';
                this.currentView = prefs.currentView || 'dashboard';
                this.currentMap = prefs.currentMap || 'Any Location';
                this.currentTrader = prefs.currentTrader || 'Prapor';
                console.log('Loaded preferences:', prefs);
            }
        } catch (err) {
            console.error('Failed to load preferences:', err);
        }
    }

    async init() {
        // Check admin status first
        await this.checkAdminStatus();
        await this.loadProgress();
        await this.loadQuests();
        this.setupEventListeners();
        this.restoreSavedView();
        this.updateUI();
        
        // Start server health monitoring
        this.startHealthCheck();
        
        // Check for and retry any pending saves
        await this.retryPendingSaves();
    }
    
    // Restore the saved view/tab
    restoreSavedView() {
        // Restore the view that was saved
        switch (this.currentView) {
            case 'dashboard':
                this.showView('dashboard');
                break;
            case 'finished':
                this.viewMode = 'finished';
                this.showView('finished');
                break;
            case 'rankings':
                this.showView('rankings');
                this.loadRankings();
                break;
            case 'profile':
                this.showView('profile');
                this.loadProfile();
                break;
            case 'fix-quests':
                if (this.isAdmin) {
                    this.showView('fix-quests');
                    this.loadFixQuests();
                } else {
                    // Fall back to dashboard if not admin
                    this.currentView = 'dashboard';
                    this.showView('dashboard');
                }
                break;
            case 'collector-items':
                this.showView('collector-items');
                this.loadCollectorItems();
                break;
            default:
                this.showView('dashboard');
        }
        this.updateNavigationState();
    }

    async checkAdminStatus() {
        try {
            const response = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await response.json();
            if (data.user && data.user.isAdmin) {
                this.isAdmin = true;
                console.log('Admin status confirmed:', this.isAdmin);
            }
        } catch (err) {
            console.error('Failed to check admin status:', err);
        }
    }

    async loadQuests() {
        try {
            const response = await fetch('/api/quests', { credentials: 'include' });
            this.quests = await response.json();
            this.buildMapsList();
        } catch (error) {
            console.error('Error loading quests:', error);
            this.quests = [];
        }
    }

    async loadProgress() {
        try {
            const response = await fetch('/api/progress', { credentials: 'include' });
            this.userProgress = await response.json();
            // completedQuests is already parsed by the server
            if (!Array.isArray(this.userProgress.completedQuests)) {
                this.userProgress.completedQuests = [];
            }
            // Ensure defaults for new fields
            if (typeof this.userProgress.pmcLevel !== 'number') {
                this.userProgress.pmcLevel = 1;
            }
            if (typeof this.userProgress.prestige !== 'number') {
                this.userProgress.prestige = 0;
            }
        } catch (error) {
            console.error('Error loading progress:', error);
        }
    }

    async saveProgress() {
        // Prevent concurrent saves
        if (this.isSaving) {
            console.log('[CLIENT-SAVE] Save already in progress, skipping...');
            return;
        }
        
        // Check server health before attempting save
        if (!this.isServerHealthy) {
            console.warn('[CLIENT-SAVE] Server unhealthy, queuing save...');
            this.queueFailedSave();
            this.showNotification('Server is unavailable. Your progress will be saved when connection is restored.', 'error');
            return;
        }
        
        this.isSaving = true;
        const maxRetries = 3;
        let attempt = 0;
        let lastError = null;
        
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        while (attempt < maxRetries) {
            attempt++;
            const saveId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            try {
                console.log(`[CLIENT-SAVE] Attempt ${attempt}/${maxRetries} - ID: ${saveId}`);
                console.log(`[CLIENT-SAVE] ${saveId} - Saving ${this.userProgress.completedQuests.length} quests`);
                
                const response = await fetch('/api/progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(this.userProgress),
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Server error: ${errorData.error || response.statusText}`);
                }
                
                // Get updated progress from server (includes auto-completed quests)
                const data = await response.json();
                
                console.log(`[CLIENT-SAVE] ${saveId} - Success! Server request ID: ${data.requestId}`);
                
                if (data.completedQuests) {
                    const questDiff = data.completedQuests.length - this.userProgress.completedQuests.length;
                    if (questDiff > 0) {
                        console.log(`[CLIENT-SAVE] ${saveId} - Auto-completed ${questDiff} additional quest(s)`);
                    }
                    this.userProgress.completedQuests = data.completedQuests;
                }
                
                // Clear any queued saves on success
                localStorage.removeItem('pendingSave');
                
                // Show success notification (only on first attempt to avoid spam)
                if (attempt === 1) {
                    this.showNotification('Progress saved successfully!', 'success');
                }
                
                this.isSaving = false;
                return; // Success!
                
            } catch (error) {
                lastError = error;
                console.error(`[CLIENT-SAVE] ${saveId} - Attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxRetries) {
                    const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`[CLIENT-SAVE] ${saveId} - Retrying in ${backoffTime}ms...`);
                    await delay(backoffTime);
                } else {
                    // All retries failed
                    console.error(`[CLIENT-SAVE] ${saveId} - All ${maxRetries} attempts failed`);
                    this.queueFailedSave();
                    this.showNotification('Failed to save progress after multiple attempts. Your progress has been saved locally.', 'error');
                }
            }
        }
        
        this.isSaving = false;
    }

    refreshOBSOverlays() {
        // Trigger a cache refresh event that OBS overlays can listen to
        // This uses browser cache API to invalidate the overlay pages
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('collector') || name.includes('kappa')) {
                        caches.delete(name);
                    }
                });
            });
        }
        
        // Also dispatch a custom event that overlay pages can listen to
        window.dispatchEvent(new CustomEvent('questUpdated', { 
            detail: { timestamp: Date.now() } 
        }));
        
        console.log('OBS overlays refreshed');
    }

    setupEventListeners() {
        const levelInput = document.getElementById('pmc-level');
        levelInput.value = this.userProgress.pmcLevel;
        levelInput.addEventListener('change', async (e) => {
            // Add visual feedback
            e.target.style.opacity = '0.6';
            e.target.disabled = true;
            
            this.userProgress.pmcLevel = parseInt(e.target.value);
            await this.saveProgress();
            this.updateUI();
            
            // Restore visual state
            e.target.style.opacity = '1';
            e.target.disabled = false;
        });

        const prestigeInput = document.getElementById('prestige-level');
        prestigeInput.value = this.userProgress.prestige || 0;
        prestigeInput.addEventListener('change', async (e) => {
            // Add visual feedback
            e.target.style.opacity = '0.6';
            e.target.disabled = true;
            
            this.userProgress.prestige = parseInt(e.target.value);
            await this.saveProgress();
            this.updateUI();
            
            // Restore visual state
            e.target.style.opacity = '1';
            e.target.disabled = false;
        });

        const dashboardTab = document.getElementById('dashboard-tab');
        const finishedQuestsTab = document.getElementById('finished-quests-tab');
        const fixQuestsTab = document.getElementById('fix-quests-tab');
        const rankingsTab = document.getElementById('rankings-tab');
        const collectorItemsTab = document.getElementById('collector-items-tab');
        
        if (dashboardTab) {
            dashboardTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToDashboard();
            });
        }
        
        if (finishedQuestsTab) {
            finishedQuestsTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToFinishedQuests();
            });
        }
        
        if (fixQuestsTab) {
            fixQuestsTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToFixQuests();
            });
        }

        if (rankingsTab) {
            rankingsTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToRankings();
            });
        }
        
        if (collectorItemsTab) {
            collectorItemsTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.showCollectorSection();
            });
        }

        const howToUseTab = document.getElementById('how-to-use-tab');
        if (howToUseTab) {
            howToUseTab.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentView = 'how-to-use';
                this.showView('how-to-use');
                this.updateNavigationState();
            });
        }

        const statisticsLink = document.getElementById('statistics-link');
        if (statisticsLink) {
            statisticsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showStatisticsSection();
            });
        }

        const futureQuestsToggle = document.getElementById('show-future-quests');
        // Restore saved state
        futureQuestsToggle.checked = this.showFutureQuests;
        futureQuestsToggle.addEventListener('change', (e) => {
            this.showFutureQuests = e.target.checked;
            this.savePreferences();
            this.updateUI();
        });

        const sortByTraderToggle = document.getElementById('sort-by-trader');
        if (sortByTraderToggle) {
            // Restore saved state
            sortByTraderToggle.checked = (this.sortBy === 'trader');
            sortByTraderToggle.addEventListener('change', (e) => {
                this.sortBy = e.target.checked ? 'trader' : 'map';
                if (this.sortBy === 'trader') {
                    this.currentTrader = this.traders[0] || 'Prapor';
                } else {
                    this.currentMap = 'Any Location';
                }
                this.savePreferences();
                this.updateUI();
            });
        }
        
        // Fix Quest search functionality
        const fixQuestSearch = document.getElementById('fix-quest-search');
        if (fixQuestSearch) {
            fixQuestSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const questCards = document.querySelectorAll('.fix-quest-card');
                
                questCards.forEach(card => {
                    const questName = card.getAttribute('data-quest-name') || '';
                    const trader = card.getAttribute('data-trader') || '';
                    
                    if (questName.includes(searchTerm) || trader.includes(searchTerm)) {
                        card.style.display = 'flex';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        }

        // Reset progress button (now in sidebar)
        const resetBtnSidebar = document.getElementById('reset-progress-btn-sidebar');
        if (resetBtnSidebar) {
            resetBtnSidebar.addEventListener('click', () => {
                this.showResetDialog();
            });
        }

        // Dialog buttons
        const cancelResetBtn = document.getElementById('cancel-reset');
        const confirmResetBtn = document.getElementById('confirm-reset');
        
        cancelResetBtn.addEventListener('click', () => {
            this.hideResetDialog();
        });
        
        confirmResetBtn.addEventListener('click', () => {
            this.resetProgress();
        });

        // Close dialog when clicking outside
        const dialogOverlay = document.getElementById('reset-dialog');
        dialogOverlay.addEventListener('click', (e) => {
            if (e.target === dialogOverlay) {
                this.hideResetDialog();
            }
        });

    }


    isQuestUnlocked(quest) {
        // Check level requirement
        if (this.userProgress.pmcLevel < quest.level) {
            return false;
        }

        // Check prerequisite quests
        if (quest.prerequisiteQuests) {
            try {
                const prerequisites = JSON.parse(quest.prerequisiteQuests);
                if (prerequisites && prerequisites.length > 0) {
                    for (const prereqId of prerequisites) {
                        if (!this.userProgress.completedQuests.includes(prereqId)) {
                            // Quest has uncompleted prerequisites, don't show it
                            return false;
                        }
                    }
                }
            } catch (e) {
                console.warn(`Failed to parse prerequisites for quest ${quest.name}:`, e);
                // If parsing fails, assume no prerequisites to avoid breaking the app
            }
        }

        return true;
    }

    getMissingPrerequisites(quest) {
        const missingQuests = [];
        if (quest.prerequisiteQuests) {
            try {
                const prerequisites = JSON.parse(quest.prerequisiteQuests);
                if (prerequisites && prerequisites.length > 0) {
                    for (const prereqId of prerequisites) {
                        if (!this.userProgress.completedQuests.includes(prereqId)) {
                            const prereqQuest = this.quests.find(q => q.id === prereqId);
                            if (prereqQuest) {
                                missingQuests.push(prereqQuest);
                            }
                        }
                    }
                }
            } catch (e) {
                // If parsing fails, assume no prerequisites
            }
        }
        return missingQuests;
    }

    getAvailableQuests() {
        return this.quests.filter(quest => {
            const isCompleted = this.userProgress.completedQuests.includes(quest.id);
            const isUnlocked = this.isQuestUnlocked(quest);
            const isRequiredForKappa = quest.requiredForKappa;
            const isOnCurrentMap = this.isQuestOnCurrentMap(quest);
            return !isCompleted && isUnlocked && isRequiredForKappa && isOnCurrentMap;
        });
    }

    getFinishedQuests() {
        return this.quests.filter(quest => {
            const isCompleted = this.userProgress.completedQuests.includes(quest.id);
            const isRequiredForKappa = quest.requiredForKappa;
            const isOnCurrentMap = this.isQuestOnCurrentMap(quest);
            return isCompleted && isRequiredForKappa && isOnCurrentMap;
        });
    }

    getFutureQuests() {
        return this.quests.filter(quest => {
            const isCompleted = this.userProgress.completedQuests.includes(quest.id);
            const isRequiredForKappa = quest.requiredForKappa;
            const isOnCurrentMap = this.isQuestOnCurrentMap(quest);
            // Show all kappa quests on the map that aren't completed, regardless of level/prerequisites
            return !isCompleted && isRequiredForKappa && isOnCurrentMap;
        });
    }

    isQuestOnCurrentMap(quest) {
        if (this.sortBy === 'trader') {
            return quest.trader === this.currentTrader;
        } else {
            const questMap = quest.mapName || 'Any Location';
            return questMap === this.currentMap;
        }
    }

    async completeQuest(questId, event) {
        if (this.userProgress.completedQuests.includes(questId)) return;
        
        const button = event ? event.target : document.querySelector(`[data-quest-id="${questId}"] .complete-btn`);
        if (!button) return;
        
        // Check if button is already in confirmation state
        if (button.classList.contains('confirm-state')) {
            // Second click - actually complete the quest
            button.disabled = true;
            
            // Add visual feedback
            const questCard = document.querySelector(`[data-quest-id="${questId}"]`);
            if (questCard) {
                questCard.style.opacity = '0.6';
                questCard.style.pointerEvents = 'none';
            }
            
            this.userProgress.completedQuests.push(questId);
            await this.saveProgress();
            this.updateUI();
            this.refreshOBSOverlays();
            
            // Reset pending quest
            this.pendingCompleteQuestId = null;
        } else {
            // First click - show confirmation
            // Reset any other confirmation buttons
            document.querySelectorAll('.complete-btn.confirm-state').forEach(btn => {
                btn.classList.remove('confirm-state');
                btn.textContent = 'COMPLETE QUEST';
                btn.style.background = '';
            });
            
            // Set this button to confirmation state
            button.classList.add('confirm-state');
            button.textContent = 'ARE YOU SURE?';
            button.style.background = '#f44336';
            
            this.pendingCompleteQuestId = questId;
            
            // Reset confirmation state after 3 seconds of no action
            setTimeout(() => {
                if (button.classList.contains('confirm-state')) {
                    button.classList.remove('confirm-state');
                    button.textContent = 'COMPLETE QUEST';
                    button.style.background = '';
                    this.pendingCompleteQuestId = null;
                }
            }, 3000);
        }
    }

    async uncompleteQuest(questId) {
        const index = this.userProgress.completedQuests.indexOf(questId);
        if (index > -1) {
            // Add visual feedback
            const questCard = document.querySelector(`[data-quest-id="${questId}"]`);
            if (questCard) {
                questCard.style.opacity = '0.6';
                questCard.style.pointerEvents = 'none';
            }
            
            this.userProgress.completedQuests.splice(index, 1);
            await this.saveProgress();
            this.updateUI();
            this.refreshOBSOverlays(); // Force OBS to refresh overlays
        }
    }

    async completeAllQuests() {
        try {
            // Get all Kappa-required quest IDs
            const allKappaQuests = this.quests.filter(q => q.requiredForKappa);
            const allKappaQuestIds = allKappaQuests.map(q => q.id);
            
            // Set all quests as completed
            this.userProgress.completedQuests = allKappaQuestIds;
            
            // Save progress
            await this.saveProgress();
            
            // Update UI
            this.updateUI();
            this.refreshOBSOverlays();
            
            // Show success notification
            this.showNotification(`Successfully completed all ${allKappaQuestIds.length} Kappa quests!`, 'success');
        } catch (error) {
            console.error('Error completing all quests:', error);
            this.showNotification('Failed to complete all quests', 'error');
            throw error;
        }
    }

    showQuestImages(questId) {
        const quest = this.quests.find(q => q.id === questId);
        if (!quest || !quest.images || quest.images.length === 0) {
            console.error('No images found for quest');
            return;
        }

        // Show image viewer dialog
        const dialog = document.getElementById('quest-image-viewer');
        const imgElement = document.getElementById('quest-image-display');
        const questNameElement = document.getElementById('quest-image-quest-name');
        const prevBtn = document.getElementById('quest-image-prev');
        const nextBtn = document.getElementById('quest-image-next');
        const counterElement = document.getElementById('quest-image-counter');
        
        let currentIndex = 0;
        const images = JSON.parse(quest.images);
        
        function updateImage() {
            imgElement.src = images[currentIndex];
            questNameElement.textContent = quest.name;
            counterElement.textContent = `${currentIndex + 1} / ${images.length}`;
            prevBtn.disabled = currentIndex === 0;
            nextBtn.disabled = currentIndex === images.length - 1;
            prevBtn.style.opacity = currentIndex === 0 ? '0.3' : '1';
            nextBtn.style.opacity = currentIndex === images.length - 1 ? '0.3' : '1';
        }
        
        prevBtn.onclick = () => {
            if (currentIndex > 0) {
                currentIndex--;
                updateImage();
            }
        };
        
        nextBtn.onclick = () => {
            if (currentIndex < images.length - 1) {
                currentIndex++;
                updateImage();
            }
        };
        
        // Close dialog when clicking outside
        const handleOverlayClick = (e) => {
            if (e.target.id === 'quest-image-viewer') {
                dialog.style.display = 'none';
                dialog.removeEventListener('click', handleOverlayClick);
                document.removeEventListener('keydown', handleEscapeKey);
            }
        };
        
        // Close dialog with Escape key
        const handleEscapeKey = (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (dialog.style.display === 'flex') {
                    dialog.style.display = 'none';
                    dialog.removeEventListener('click', handleOverlayClick);
                    document.removeEventListener('keydown', handleEscapeKey);
                }
            }
        };
        
        dialog.addEventListener('click', handleOverlayClick);
        document.addEventListener('keydown', handleEscapeKey);
        
        updateImage();
        dialog.style.display = 'flex';
    }

    toggleViewMode() {
        this.viewMode = this.viewMode === 'available' ? 'finished' : 'available';
        this.updateNavigationState();
        this.updateUI();
    }

    switchToDashboard() {
        this.viewMode = 'available';
        this.currentView = 'dashboard';
        this.savePreferences();
        this.showView('dashboard');
        this.updateNavigationState();
        this.updateUI();
    }

    switchToFinishedQuests() {
        this.viewMode = 'finished';
        this.currentView = 'finished';
        this.savePreferences();
        this.showView('finished');
        this.updateNavigationState();
        this.updateUI();
    }

    switchToRankings() {
        this.currentView = 'rankings';
        this.savePreferences();
        this.showView('rankings');
        this.updateNavigationState();
        this.loadRankings();
    }

    switchToProfile() {
        this.currentView = 'profile';
        this.savePreferences();
        this.showView('profile');
        this.updateNavigationState();
        this.loadProfile();
    }
    
    switchToFixQuests() {
        this.currentView = 'fix-quests';
        this.savePreferences();
        this.showView('fix-quests');
        this.updateNavigationState();
        this.loadFixQuests();
    }
    
    showCollectorSection() {
        this.currentView = 'collector-items';
        this.savePreferences();
        this.showView('collector-items');
        this.updateNavigationState();
        this.loadCollectorItems();
    }
    
    loadCollectorItems() {
        // Collector items are already loaded in the HTML
        // This function exists to maintain consistency
        // The collector items functionality is handled by the HTML
        console.log('Collector items view loaded');
    }

    showStatisticsSection() {
        this.currentView = 'statistics';
        this.savePreferences();
        this.showView('statistics');
        this.updateNavigationState();
        this.loadStatistics();
    }

    async loadStatistics() {
        console.log('Loading statistics...');
        
        // Initialize statistics
        if (!window.statisticsManager) {
            window.statisticsManager = new StatisticsManager();
        }
        
        await window.statisticsManager.init();
    }

    showView(view) {
        /*
         * Section Structure Rules:
         * - Each main page has a section in main-content with class matching the page name
         * - Class names are lowercase with hyphens instead of spaces
         * - Section IDs match the class names
         * - Sections: dashboard, finished-quests, fix-quests, rankings, profile, collector-items, statistics, how-to-use
         * - The sidebar is shown on dashboard and finished-quests only
         * - Quest Requirements sidebar (right-sidebar) is part of dashboard section only
         */
        
        // Hide all main sections
        const dashboard = document.getElementById('dashboard');
        const finishedQuests = document.getElementById('finished-quests');
        const fixQuests = document.getElementById('fix-quests');
        const rankings = document.getElementById('rankings');
        const profile = document.getElementById('profile');
        const collectorItems = document.getElementById('collector-items');
        const statistics = document.getElementById('statistics');
        const howToUse = document.getElementById('how-to-use');
        const sidebar = document.querySelector('.sidebar');

        if (dashboard) dashboard.style.display = 'none';
        if (finishedQuests) finishedQuests.style.display = 'none';
        if (fixQuests) fixQuests.style.display = 'none';
        if (rankings) rankings.style.display = 'none';
        if (profile) profile.style.display = 'none';
        if (collectorItems) collectorItems.style.display = 'none';
        if (statistics) statistics.style.display = 'none';
        if (howToUse) howToUse.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

        // Show relevant section and sidebar based on view
        if (view === 'dashboard') {
            if (dashboard) dashboard.style.display = 'block';
            if (sidebar) sidebar.style.display = 'flex';
        } else if (view === 'finished') {
            if (finishedQuests) finishedQuests.style.display = 'block';
            if (sidebar) sidebar.style.display = 'flex';
        } else if (view === 'fix-quests') {
            if (fixQuests) fixQuests.style.display = 'block';
        } else if (view === 'rankings') {
            if (rankings) rankings.style.display = 'block';
        } else if (view === 'profile') {
            if (profile) profile.style.display = 'block';
        } else if (view === 'collector-items') {
            if (collectorItems) collectorItems.style.display = 'block';
        } else if (view === 'statistics') {
            if (statistics) statistics.style.display = 'block';
        } else if (view === 'how-to-use') {
            if (howToUse) howToUse.style.display = 'block';
        }
    }

    updateNavigationState() {
        const dashboardTab = document.getElementById('dashboard-tab');
        const finishedQuestsTab = document.getElementById('finished-quests-tab');
        const rankingsTab = document.getElementById('rankings-tab');
        const fixQuestsTab = document.getElementById('fix-quests-tab');
        const collectorItemsTab = document.getElementById('collector-items-tab');
        const howToUseTab = document.getElementById('how-to-use-tab');
        
        // Remove active class from all tabs
        [dashboardTab, finishedQuestsTab, rankingsTab, fixQuestsTab, collectorItemsTab, howToUseTab].forEach(tab => {
            if (tab) tab.classList.remove('active');
        });
        
        // Add active class to current view
        if (this.currentView === 'dashboard') {
            dashboardTab?.classList.add('active');
        } else if (this.currentView === 'finished') {
            finishedQuestsTab?.classList.add('active');
        } else if (this.currentView === 'rankings') {
            rankingsTab?.classList.add('active');
        } else if (this.currentView === 'fix-quests') {
            fixQuestsTab?.classList.add('active');
        } else if (this.currentView === 'collector-items') {
            collectorItemsTab?.classList.add('active');
        } else if (this.currentView === 'how-to-use') {
            howToUseTab?.classList.add('active');
        }
    }

    updateUI() {
        if (this.sortBy === 'trader') {
            this.buildTraderTabs();
        } else {
            this.buildMapTabs();
        }
        this.updateMapOverview();
        this.updateProgressBar();
        this.updateQuestsList();
        this.notifyCollectorWindows();
    }

    notifyCollectorWindows() {
        // Notify any open collector progress windows
        if (window.collectorWindow && !window.collectorWindow.closed) {
            window.collectorWindow.postMessage({
                type: 'progressUpdate',
                quests: this.quests,
                userProgress: this.userProgress
            }, '*');
        }
    }

    updateProgressBar() {
        const kappaQuests = this.quests.filter(quest => quest.requiredForKappa);
        const totalKappaQuests = kappaQuests.length;
        const completedKappaQuests = kappaQuests.filter(quest => 
            this.userProgress.completedQuests.includes(quest.id)
        ).length;
        const percentage = totalKappaQuests > 0 ? (completedKappaQuests / totalKappaQuests) * 100 : 0;

        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage.toFixed(1)}% (${completedKappaQuests}/${totalKappaQuests} collector quests)`;
    }

    updateQuestsList() {
        // Determine which grid to update based on current view
        const questsGrid = this.viewMode === 'finished' 
            ? document.getElementById('quests-grid-finished') 
            : document.getElementById('quests-grid');
        
        if (!questsGrid) return;
        
        let questsToShow;
        
        if (this.viewMode === 'finished') {
            questsToShow = this.getFinishedQuests();
        } else if (this.showFutureQuests) {
            questsToShow = this.getFutureQuests();
        } else {
            questsToShow = this.getAvailableQuests();
        }

        if (questsToShow.length === 0) {
            let emptyMessage;
            if (this.viewMode === 'finished') {
                emptyMessage = 'No completed quests on this map.';
            } else if (this.showFutureQuests) {
                emptyMessage = 'No future quests available on this map.';
            } else {
                emptyMessage = this.quests.length === 0 ? 'Loading quests...' : 'All available quests completed! Check your level or wait for new unlocks.';
            }
            
            questsGrid.innerHTML = `
                <div class="loading">
                    ${emptyMessage}
                </div>
            `;
            return;
        }

        questsGrid.innerHTML = questsToShow.map(quest => {
            const objectives = this.parseObjectives(quest.objectives);
            const objectivesHtml = this.renderObjectives(objectives);
            
            // Render notes if they exist
            const notesHtml = this.renderNotes(quest.notes);
            
            // Render shopping list if it exists (for Gunsmith quests)
            const shoppingListHtml = this.renderShoppingList(quest.shoppingList, quest.name);
            
            // Parse required items from server data
            const requiredItems = this.parseRequiredItems(quest.requiredItems);
            const itemsHtml = this.renderRequiredItems(requiredItems);
            
            // Find quests unlocked by completing this quest
            const unlocksHtml = this.renderUnlockedQuests(quest.id);
            
            // Find quests that will be auto-completed
            const autoCompleteHtml = this.renderAutoCompleteQuests(quest.id);

            // Choose button and additional info based on view mode
            let buttonHtml, additionalInfo = '';
            
            if (this.viewMode === 'finished') {
                buttonHtml = `<button class="complete-btn uncomplete-btn" onclick="window.tracker.uncompleteQuest('${quest.id}')">
                                 UNCOMPLETE QUEST
                               </button>`;
            } else if (this.showFutureQuests) {
                // Show why the quest is locked for future quests
                const isUnlocked = this.isQuestUnlocked(quest);
                if (!isUnlocked) {
                    const missingLevel = quest.level > this.userProgress.pmcLevel;
                    const prerequisiteQuests = this.getMissingPrerequisites(quest);
                    
                    if (missingLevel) {
                        additionalInfo = `<div class="quest-locked"><i class="fas fa-lock"></i> Requires Level ${quest.level}</div>`;
                    } else if (prerequisiteQuests.length > 0) {
                        const prereqNames = prerequisiteQuests.slice(0, 2).map(q => q.name).join(', ');
                        const morePrereqs = prerequisiteQuests.length > 2 ? ` (+${prerequisiteQuests.length - 2} more)` : '';
                        additionalInfo = `<div class="quest-locked"><i class="fas fa-lock"></i> Complete: ${prereqNames}${morePrereqs}</div>`;
                    }
                }
                buttonHtml = `<button class="complete-btn" onclick="window.tracker.completeQuest('${quest.id}', event)">
                                 COMPLETE QUEST
                               </button>`;
            } else {
                buttonHtml = `<button class="complete-btn" onclick="window.tracker.completeQuest('${quest.id}', event)">
                                 COMPLETE QUEST
                               </button>`;
            }

            // Quest cards use neutral colors, buttons have the color coding
            let questCardClass = '';
            if (this.viewMode === 'finished') {
                questCardClass = 'completed-quest';
            }

            // Check if quest has images
            let hasImages = false;
            try {
                if (quest.images && quest.images !== '[]') {
                    const images = JSON.parse(quest.images);
                    hasImages = Array.isArray(images) && images.length > 0;
                }
            } catch (e) {
                hasImages = false;
            }
            
            const unlockHoursHtml = quest.unlockAfterHours > 0 
                ? `<div class="quest-unlock-timer" title="Unlocks ${quest.unlockAfterHours} hours after prerequisites">+${quest.unlockAfterHours}h</div>` 
                : '';
            
            return `
                <div class="quest-card ${questCardClass}" data-quest-id="${quest.id}">
                    <div class="quest-header">
                        <div class="quest-name">${quest.name}${unlockHoursHtml}</div>
                        <div class="quest-actions">
                            ${hasImages ? `<button class="quest-images-btn" onclick="window.tracker.showQuestImages('${quest.id}')" title="View Images">
                                <i class="fas fa-image"></i>
                            </button>` : ''}
                            ${quest.wikiLink ? `<a href="${quest.wikiLink}" target="_blank" class="wiki-link" title="Open Wiki">Wiki</a>` : ''}
                            ${this.isAdmin ? `<button class="wiki-link quest-fix-btn" onclick="if(window.openQuestEditDialog) window.openQuestEditDialog('${quest.id}')" title="Fix Quest">Fix</button>` : ''}
                            ${this.showFutureQuests ? `<div class="quest-level-req">L${quest.level}</div>` : ''}
                        </div>
                    </div>
                    <div class="quest-trader">${quest.trader}</div>
                    ${objectivesHtml}
                    ${notesHtml}
                    ${shoppingListHtml}
                    ${itemsHtml}
                    ${unlocksHtml}
                    ${autoCompleteHtml}
                    ${additionalInfo}
                    ${buttonHtml}
                </div>
            `;
        }).join('');
    }

    buildMapsList() {
        const mapSet = new Set();
        
        this.quests.forEach(quest => {
            if (quest.requiredForKappa) {
                const mapName = quest.mapName || 'General';
                mapSet.add(mapName);
            }
        });
        
        const mapsArray = Array.from(mapSet);
        
        // Sort maps by available quest count (highest to lowest)
        const sortedMaps = mapsArray.sort((a, b) => {
            if (a === 'Any Location') return -1; // Any Location always first
            if (b === 'Any Location') return 1;
            
            const aStats = this.getQuestStatsForMap(a);
            const bStats = this.getQuestStatsForMap(b);
            return bStats.available - aStats.available; // Descending order
        });
        
        this.maps = sortedMaps;
        this.buildTradersList();
    }

    buildTradersList() {
        const traderSet = new Set();
        
        this.quests.forEach(quest => {
            if (quest.requiredForKappa && quest.trader) {
                traderSet.add(quest.trader);
            }
        });
        
        const tradersArray = Array.from(traderSet);
        
        // Define trader order
        const traderOrder = ['Prapor', 'Therapist', 'Fence', 'Skier', 'Peacekeeper', 'Mechanic', 'Ragman', 'Jaeger', 'Lightkeeper', 'Ref'];
        
        // Sort traders by defined order
        const sortedTraders = tradersArray.sort((a, b) => {
            const aIndex = traderOrder.indexOf(a);
            const bIndex = traderOrder.indexOf(b);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
        
        this.traders = sortedTraders;
    }

    buildMapTabs() {
        const mapTabsContainer = document.getElementById('map-tabs');
        const mapTabsFinishedContainer = document.getElementById('map-tabs-finished');
        
        const tabsHtml = this.maps
            .filter(mapName => {
                const questStats = this.getQuestStatsForMap(mapName);
                // Hide tabs with no quests or where all Kappa quests are completed
                return questStats.total > 0 && (questStats.available > 0 || this.viewMode === 'finished');
            })
            .map(mapName => {
            const questStats = this.getQuestStatsForMap(mapName);
            const isActive = (mapName === this.currentMap) ? 'active' : '';
            
            return `
                <button class="map-tab ${isActive}" onclick="window.tracker.switchMap('${mapName}')">
                    ${mapName} (<strong>${questStats.available}</strong>) ${questStats.completed}/${questStats.total}
                </button>
            `;
        }).join('');
        
        if (mapTabsContainer) mapTabsContainer.innerHTML = tabsHtml;
        if (mapTabsFinishedContainer) mapTabsFinishedContainer.innerHTML = tabsHtml;
    }

    getQuestStatsForMap(mapName) {
        let allMapQuests, completedQuests, availableQuests;
        
        allMapQuests = this.quests.filter(quest => {
            if (!quest.requiredForKappa) return false;
            const questMap = quest.mapName || 'Any Location';
            return questMap === mapName;
        });
        
        completedQuests = allMapQuests.filter(quest => 
            this.userProgress.completedQuests.includes(quest.id)
        ).length;
        
        if (this.viewMode === 'finished') {
            // In finished mode, show completed count instead of available
            availableQuests = completedQuests;
        } else if (this.showFutureQuests) {
            // In future mode, show all uncompleted quests
            availableQuests = allMapQuests.filter(quest => {
                const isCompleted = this.userProgress.completedQuests.includes(quest.id);
                return !isCompleted;
            }).length;
        } else {
            availableQuests = allMapQuests.filter(quest => {
                const isCompleted = this.userProgress.completedQuests.includes(quest.id);
                const isUnlocked = this.isQuestUnlocked(quest);
                return !isCompleted && isUnlocked;
            }).length;
        }
        
        return {
            total: allMapQuests.length,
            completed: completedQuests,
            available: availableQuests
        };
    }

    switchMap(mapName) {
        this.currentMap = mapName;
        this.savePreferences();
        this.updateUI();
    }

    buildTraderTabs() {
        const mapTabsContainer = document.getElementById('map-tabs');
        const mapTabsFinishedContainer = document.getElementById('map-tabs-finished');
        
        const tabsHtml = this.traders
            .filter(traderName => {
                const questStats = this.getQuestStatsForTrader(traderName);
                // Hide tabs with no quests or where all Kappa quests are completed
                return questStats.total > 0 && (questStats.available > 0 || this.viewMode === 'finished');
            })
            .map(traderName => {
            const questStats = this.getQuestStatsForTrader(traderName);
            const isActive = (traderName === this.currentTrader) ? 'active' : '';
            
            return `
                <button class="map-tab ${isActive}" onclick="window.tracker.switchTrader('${traderName}')">
                    ${traderName} (<strong>${questStats.available}</strong>) ${questStats.completed}/${questStats.total}
                </button>
            `;
        }).join('');
        
        if (mapTabsContainer) mapTabsContainer.innerHTML = tabsHtml;
        if (mapTabsFinishedContainer) mapTabsFinishedContainer.innerHTML = tabsHtml;
    }

    getQuestStatsForTrader(traderName) {
        let allTraderQuests, completedQuests, availableQuests;
        
        allTraderQuests = this.quests.filter(quest => {
            if (!quest.requiredForKappa) return false;
            return quest.trader === traderName;
        });
        
        completedQuests = allTraderQuests.filter(quest => 
            this.userProgress.completedQuests.includes(quest.id)
        ).length;
        
        if (this.viewMode === 'finished') {
            availableQuests = completedQuests;
        } else if (this.showFutureQuests) {
            availableQuests = allTraderQuests.filter(quest => {
                const isCompleted = this.userProgress.completedQuests.includes(quest.id);
                return !isCompleted;
            }).length;
        } else {
            availableQuests = allTraderQuests.filter(quest => {
                const isCompleted = this.userProgress.completedQuests.includes(quest.id);
                const isUnlocked = this.isQuestUnlocked(quest);
                return !isCompleted && isUnlocked;
            }).length;
        }
        
        return {
            total: allTraderQuests.length,
            completed: completedQuests,
            available: availableQuests
        };
    }

    switchTrader(traderName) {
        this.currentTrader = traderName;
        this.savePreferences();
        this.updateUI();
    }

    updateMapOverview() {
        const currentQuests = this.sortBy === 'trader' 
            ? this.getQuestsForCurrentTrader() 
            : this.getQuestsForCurrentMap();
        
        // Get the appropriate quest list based on current mode
        let questsToCount;
        if (this.viewMode === 'finished') {
            questsToCount = this.getFinishedQuests();
        } else if (this.showFutureQuests) {
            questsToCount = this.getFutureQuests();
        } else {
            questsToCount = this.getAvailableQuests();
        }
        
        // Filter questsToCount based on current map/trader
        if (this.sortBy === 'trader') {
            questsToCount = questsToCount.filter(q => q.trader === this.currentTrader);
        } else {
            const questMap = quest => quest.mapName || 'Any Location';
            questsToCount = questsToCount.filter(q => questMap(q) === this.currentMap);
        }
        
        const itemCounts = this.calculateItemCounts(questsToCount);
        const keysList = this.getKeysList(questsToCount);
        const firItemsList = this.getFirItemsList(questsToCount);
        
        // Update counts and show/hide stat items based on their values
        const markersStatItem = document.querySelector('.stat-item:has(#markers-count)');
        document.getElementById('markers-count').textContent = itemCounts.markers;
        if (markersStatItem) markersStatItem.style.display = itemCounts.markers > 0 ? 'flex' : 'none';
        
        const jammersStatItem = document.querySelector('.stat-item:has(#jammers-count)');
        document.getElementById('jammers-count').textContent = itemCounts.jammers;
        if (jammersStatItem) jammersStatItem.style.display = itemCounts.jammers > 0 ? 'flex' : 'none';
        
        const camerasStatItem = document.querySelector('.stat-item:has(#cameras-count)');
        document.getElementById('cameras-count').textContent = itemCounts.cameras;
        if (camerasStatItem) camerasStatItem.style.display = itemCounts.cameras > 0 ? 'flex' : 'none';
        
        const keysStatItem = document.querySelector('.stat-item.keys-list-item');
        document.getElementById('keys-count').textContent = itemCounts.keys;
        
        // Update keys list and show/hide
        const keysListElement = document.getElementById('keys-list');
        if (keysList.length === 0) {
            keysListElement.textContent = 'None';
            if (keysStatItem) keysStatItem.style.display = 'none';
        } else {
            keysListElement.innerHTML = keysList.map(key => 
                `<span class="key-item">${key.name}</span>`
            ).join('');
            if (keysStatItem) keysStatItem.style.display = 'flex';
        }
        
        // Update FIR items list and show/hide
        const firStatItem = document.querySelector('.stat-item.fir-list-item');
        const firListElement = document.getElementById('fir-list');
        if (firItemsList.length === 0) {
            firListElement.textContent = 'None';
            if (firStatItem) firStatItem.style.display = 'none';
        } else {
            firListElement.innerHTML = firItemsList.map(item => 
                `<span class="fir-item">${item.name} x${item.count}</span>`
            ).join('');
            if (firStatItem) firStatItem.style.display = 'flex';
        }
    }

    getQuestsForCurrentMap() {
        return this.quests.filter(quest => {
            if (!quest.requiredForKappa) return false;
            const questMap = quest.mapName || 'Any Location';
            return questMap === this.currentMap;
        });
    }

    getQuestsForCurrentTrader() {
        return this.quests.filter(quest => {
            if (!quest.requiredForKappa) return false;
            return quest.trader === this.currentTrader;
        });
    }

    calculateItemCounts(quests) {
        const counts = { markers: 0, jammers: 0, cameras: 0, keys: 0, fir: 0 };
        
        quests.forEach(quest => {
            try {
                const requiredItems = JSON.parse(quest.requiredItems || '[]');
                requiredItems.forEach(item => {
                    // Check category first, then fallback to type and name checking
                    // For plantItem types, we need to check the item name
                    const isMarker = item.category === 'markers' || (item.type === 'plantItem' && (item.name.includes('Marker') || item.name.includes('MS2000')));
                    const isJammer = item.category === 'jammers' || (item.type === 'plantItem' && (item.name.includes('Jammer') || item.name.includes('SJ')));
                    const isCamera = item.category === 'cameras' || (item.type === 'plantItem' && (item.name.includes('Camera') || item.name.includes('WI-FI')));
                    const isKey = item.category === 'keys' || item.type === 'key';
                    
                    if (isMarker) counts.markers += item.count || 1;
                    if (isJammer) counts.jammers += item.count || 1;
                    if (isCamera) counts.cameras += item.count || 1;
                    if (isKey) counts.keys += 1; // Keys are counted as 1 each
                    if (item.category === 'fir') counts.fir += item.count || 1;
                });
            } catch (e) {
                // Invalid JSON, skip
            }
        });
        
        return counts;
    }

    getKeysList(quests) {
        const keysMap = new Map();
        
        quests.forEach(quest => {
            try {
                const requiredItems = JSON.parse(quest.requiredItems || '[]');
                requiredItems.forEach(item => {
                    if (item.category === 'keys' || item.type === 'key') {
                        const keyName = item.displayName || item.name.replace(/_/g, ' ');
                        if (keysMap.has(keyName)) {
                            const existing = keysMap.get(keyName);
                            existing.count = Math.max(existing.count, item.count || 1);
                        } else {
                            keysMap.set(keyName, {
                                name: keyName,
                                count: item.count || 1
                            });
                        }
                    }
                });
            } catch (e) {
                // Invalid JSON, skip
            }
        });
        
        return Array.from(keysMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    getFirItemsList(quests) {
        const firMap = new Map();
        
        quests.forEach(quest => {
            try {
                const requiredItems = JSON.parse(quest.requiredItems || '[]');
                requiredItems.forEach(item => {
                    if (item.category === 'fir') {
                        if (firMap.has(item.name)) {
                            const existing = firMap.get(item.name);
                            existing.count = Math.max(existing.count, item.count);
                        } else {
                            firMap.set(item.name, {
                                name: item.name,
                                count: item.count
                            });
                        }
                    }
                });
            } catch (e) {
                // Invalid JSON, skip
            }
        });
        
        return Array.from(firMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    parseObjectives(objectivesJson) {
        try {
            return JSON.parse(objectivesJson || '[]');
        } catch (e) {
            return [];
        }
    }

    renderObjectives(objectives) {
        if (!objectives || objectives.length === 0) return '';
        
        const objectivesList = objectives.map(obj => {
            // Handle both string and object objectives
            let text = '';
            if (typeof obj === 'string') {
                text = obj;
            } else if (typeof obj === 'object' && obj !== null) {
                // Extract description from object
                text = obj.description || obj.text || obj.name || JSON.stringify(obj);
            } else {
                text = String(obj);
            }
            return `<li>${text}</li>`;
        }).join('');
        
        const uniqueId = `objectives-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="quest-objectives">
                <div class="quest-objectives-header" onclick="window.tracker.toggleObjectives('${uniqueId}')">
                    <div class="quest-objectives-title">
                        <i class="fas fa-tasks"></i> Objectives
                    </div>
                    <i class="fas fa-chevron-down objectives-toggle-icon" id="${uniqueId}-icon"></i>
                </div>
                <ul class="objectives-list collapsed" id="${uniqueId}">
                    ${objectivesList}
                </ul>
            </div>
        `;
    }

    toggleObjectives(id) {
        const list = document.getElementById(id);
        const icon = document.getElementById(`${id}-icon`);
        if (list && icon) {
            list.classList.toggle('collapsed');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        }
    }

    renderNotes(notes) {
        if (!notes || notes.trim() === '') return '';
        
        // Escape HTML and preserve line breaks
        const escapedNotes = notes
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\n/g, '<br>');
        
        return `
            <div class="quest-notes">
                <div class="quest-notes-icon">
                    <i class="fas fa-sticky-note"></i>
                </div>
                <div class="quest-notes-text">${escapedNotes}</div>
            </div>
        `;
    }

    renderShoppingList(shoppingListJson, questName) {
        // Only show shopping lists for Gunsmith quests
        if (!questName || !questName.startsWith('Gunsmith')) return '';
        
        if (!shoppingListJson) return '';
        
        let shoppingList;
        try {
            shoppingList = JSON.parse(shoppingListJson);
        } catch (e) {
            return '';
        }
        
        if (!Array.isArray(shoppingList) || shoppingList.length === 0) return '';
        
        // Sort: Base Weapon first, then rest in original order
        const sortedList = [...shoppingList].sort((a, b) => {
            if (a.trader === 'Base Weapon') return -1;
            if (b.trader === 'Base Weapon') return 1;
            return 0;
        });
        
        // Generate unique ID for this shopping list
        const uniqueId = 'shopping-' + Math.random().toString(36).substr(2, 9);
        
        const itemsHtml = sortedList.map(item => {
            let traderInfo;
            if (item.trader === 'Base Weapon') {
                traderInfo = '<i class="fas fa-star"></i> Base Weapon';
            } else {
                const barterTag = item.isBarter ? ' <i class="fas fa-exchange-alt" title="Barter"></i>' : '';
                traderInfo = item.trader ? `${item.trader} LL${item.loyaltyLevel || 1}${barterTag}` : 'Unknown';
            }
            return `
                <div class="shopping-list-item">
                    <span class="shopping-item-name">${this.escapeHtml(item.name)}</span>
                    <span class="shopping-item-trader">${traderInfo}</span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="quest-shopping-list">
                <div class="shopping-list-header" onclick="window.tracker.toggleShoppingList('${uniqueId}')">
                    <div class="shopping-list-title">
                        <i class="fas fa-shopping-cart"></i> Shopping List
                    </div>
                    <i id="${uniqueId}-icon" class="fas fa-chevron-down shopping-toggle-icon"></i>
                </div>
                <div id="${uniqueId}" class="shopping-list-items collapsed">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    toggleShoppingList(id) {
        const list = document.getElementById(id);
        const icon = document.getElementById(`${id}-icon`);
        if (list && icon) {
            list.classList.toggle('collapsed');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        }
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    parseRequiredItems(itemsJson) {
        try {
            return JSON.parse(itemsJson || '[]');
        } catch (e) {
            return [];
        }
    }

    renderRequiredItems(items) {
        if (!items || items.length === 0) return '';
        
        // Separate items by category (not type)
        // type is the objective type (plantItem, etc), category is the item category (markers, jammers, cameras, keys)
        const keys = items.filter(item => item.category === 'keys' || item.type === 'key');
        const markers = items.filter(item => item.category === 'markers' || item.type === 'plantItem' && (item.name.includes('Marker') || item.name.includes('MS2000')));
        const jammers = items.filter(item => item.category === 'jammers' || item.type === 'plantItem' && (item.name.includes('Jammer') || item.name.includes('SJ')));
        const cameras = items.filter(item => item.category === 'cameras' || item.type === 'plantItem' && (item.name.includes('Camera') || item.name.includes('WI-FI')));
        
        let html = '';
        
        // Render keys section
        if (keys.length > 0) {
            const keyTags = keys.map(item => {
                const displayName = item.displayName || item.name.replace(/_/g, ' ');
                return `<span class="item-tag key">${displayName}</span>`;
            }).join('');
            
            html += `
                <div class="quest-items">
                    <div class="quest-items-title"><i class="fas fa-key"></i> Required Keys:</div>
                    <div class="items-list">${keyTags}</div>
                </div>
            `;
        }
        
        // Render markers section
        if (markers.length > 0) {
            const markerTags = markers.map(item => {
                const displayName = item.displayName || item.name.replace(/_/g, ' ');
                return `<span class="item-tag markers">${displayName} x${item.count}</span>`;
            }).join('');
            
            html += `
                <div class="quest-items">
                    <div class="quest-items-title"><i class="fas fa-map-marker-alt"></i> Required Markers:</div>
                    <div class="items-list">${markerTags}</div>
                </div>
            `;
        }
        
        // Render jammers section
        if (jammers.length > 0) {
            const jammerTags = jammers.map(item => {
                const displayName = item.displayName || item.name.replace(/_/g, ' ');
                return `<span class="item-tag jammers">${displayName} x${item.count}</span>`;
            }).join('');
            
            html += `
                <div class="quest-items">
                    <div class="quest-items-title"><i class="fas fa-broadcast-tower"></i> Required Jammers:</div>
                    <div class="items-list">${jammerTags}</div>
                </div>
            `;
        }
        
        // Render cameras section
        if (cameras.length > 0) {
            const cameraTags = cameras.map(item => {
                const displayName = item.displayName || item.name.replace(/_/g, ' ');
                return `<span class="item-tag cameras">${displayName} x${item.count}</span>`;
            }).join('');
            
            html += `
                <div class="quest-items">
                    <div class="quest-items-title"><i class="fas fa-video"></i> Required Cameras:</div>
                    <div class="items-list">${cameraTags}</div>
                </div>
            `;
        }
        
        // Render FIR items section
        const firItems = items.filter(item => item.category === 'fir');
        if (firItems.length > 0) {
            const firTags = firItems.map(item => {
                const displayName = item.displayName || item.name.replace(/_/g, ' ');
                return `<span class="item-tag fir">${displayName} x${item.count}</span>`;
            }).join('');
            
            html += `
                <div class="quest-items">
                    <div class="quest-items-title"><i class="fas fa-box"></i> Required FIR Items:</div>
                    <div class="items-list">${firTags}</div>
                </div>
            `;
        }
        
        return html;
    }

    renderUnlockedQuests(questId) {
        // Find quests that have this quest as a prerequisite
        const unlockedQuests = this.quests.filter(quest => {
            if (!quest.requiredForKappa) return false;
            try {
                const prerequisites = JSON.parse(quest.prerequisiteQuests || '[]');
                return prerequisites.includes(questId);
            } catch (e) {
                return false;
            }
        });

        if (unlockedQuests.length === 0) return '';

        const questLinks = unlockedQuests.slice(0, 2).map(quest => 
            quest.wikiLink ? `<a href="${quest.wikiLink}" target="_blank" class="unlock-link">${quest.name}</a>` : quest.name
        );
        const moreCount = unlockedQuests.length > 2 ? ` (+${unlockedQuests.length - 2} more)` : '';
        
        return `
            <div class="quest-unlocks">
                <div class="quest-unlocks-title"><i class="fas fa-unlock"></i> Unlocks:</div>
                <div class="unlocks-text">${questLinks.join(', ')}${moreCount}</div>
            </div>
        `;
    }

    renderAutoCompleteQuests(questId) {
        // Find current quest to get its autoCompleteQuests
        const currentQuest = this.quests.find(q => q.id === questId);
        if (!currentQuest || !currentQuest.autoCompleteQuests) return '';
        
        try {
            const autoCompleteIds = JSON.parse(currentQuest.autoCompleteQuests);
            if (autoCompleteIds.length === 0) return '';
            
            // Get the actual quest objects
            const autoCompleteQuests = autoCompleteIds
                .map(id => this.quests.find(q => q.id === id))
                .filter(q => q); // Remove any null/undefined
            
            if (autoCompleteQuests.length === 0) return '';
            
            const questLinks = autoCompleteQuests.slice(0, 2).map(quest => 
                quest.wikiLink ? `<a href="${quest.wikiLink}" target="_blank" class="unlock-link">${quest.name}</a>` : quest.name
            );
            const moreCount = autoCompleteQuests.length > 2 ? ` (+${autoCompleteQuests.length - 2} more)` : '';
            
            return `
                <div class="quest-autocomplete">
                    <div class="quest-autocomplete-title"><i class="fas fa-magic"></i> Auto-completes:</div>
                    <div class="autocomplete-text">${questLinks.join(', ')}${moreCount}</div>
                </div>
            `;
        } catch (e) {
            return '';
        }
    }

    showResetDialog() {
        const dialog = document.getElementById('reset-dialog');
        dialog.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    hideResetDialog() {
        const dialog = document.getElementById('reset-dialog');
        dialog.classList.remove('show');
        document.body.style.overflow = ''; // Restore scrolling
    }

    showCompleteQuestDialog(questName) {
        const dialog = document.getElementById('complete-quest-dialog');
        const questNameDisplay = document.getElementById('complete-quest-name');
        questNameDisplay.textContent = questName;
        dialog.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    hideCompleteQuestDialog() {
        const dialog = document.getElementById('complete-quest-dialog');
        dialog.classList.remove('show');
        document.body.style.overflow = ''; // Restore scrolling
        this.pendingCompleteQuestId = null;
    }

    async resetProgress() {
        try {
            // Show loading state
            const confirmBtn = document.getElementById('confirm-reset');
            const originalText = confirmBtn.textContent;
            confirmBtn.textContent = 'Resetting...';
            confirmBtn.disabled = true;

            // Call the reset API
            const response = await fetch('/api/reset-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to reset progress');
            }

            // Reset local progress
            this.userProgress = {
                pmcLevel: 1,
                prestige: 0,
                completedQuests: []
            };

            // Update UI
            document.getElementById('pmc-level').value = 1;
            document.getElementById('prestige-level').value = 0;
            this.updateUI();

            // Hide dialog
            this.hideResetDialog();

            // Show success message
            this.showNotification('Progress reset successfully!', 'success');

        } catch (error) {
            console.error('Error resetting progress:', error);
            this.showNotification('Failed to reset progress. Please try again.', 'error');
            
            // Reset button state
            const confirmBtn = document.getElementById('confirm-reset');
            confirmBtn.textContent = 'Reset Progress';
            confirmBtn.disabled = false;
        }
    }

    async openCollectorProgress() {
        try {
            // Fetch unique URL from server
            const response = await fetch('/api/user/collector-url', { credentials: 'include' });
            const data = await response.json();
            
            if (data.url) {
                // Open collector progress with unique URL
                const collectorWindow = window.open(
                    data.url,
                    'collectorProgress',
                    'width=600,height=500,scrollbars=no,resizable=yes,menubar=no,toolbar=no,location=no,status=no'
                );
                
                // Store reference for updates
                window.collectorWindow = collectorWindow;
            } else {
                this.showNotification('Failed to generate collector URL', 'error');
            }
        } catch (error) {
            console.error('Error opening collector progress:', error);
            this.showNotification('Error opening collector progress', 'error');
        }
    }

    async openKappaOverview() {
        try {
            // Fetch unique URL from server
            const response = await fetch('/api/user/kappa-url', { credentials: 'include' });
            const data = await response.json();
            
            if (data.url) {
                // Open kappa overview with unique URL in new tab
                window.open(data.url, '_blank');
            } else {
                this.showNotification('Failed to generate kappa overview URL', 'error');
            }
        } catch (error) {
            console.error('Error opening kappa overview:', error);
            this.showNotification('Error opening kappa overview', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '6px',
            color: '#ffffff',
            fontWeight: '600',
            fontSize: '14px',
            zIndex: '1001',
            maxWidth: '300px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });

        // Set background color based on type
        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        } else if (type === 'error') {
            notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        } else {
            notification.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        }

        // Add to page
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Queue failed save to localStorage for later retry
    queueFailedSave() {
        try {
            const saveData = {
                userProgress: this.userProgress,
                timestamp: Date.now()
            };
            localStorage.setItem('pendingSave', JSON.stringify(saveData));
            console.log('[CLIENT-SAVE] Queued save to localStorage');
        } catch (error) {
            console.error('[CLIENT-SAVE] Failed to queue save:', error);
        }
    }

    // Check for and retry any pending saves
    async retryPendingSaves() {
        try {
            const pendingSave = localStorage.getItem('pendingSave');
            if (!pendingSave) return;
            
            const saveData = JSON.parse(pendingSave);
            const age = Date.now() - saveData.timestamp;
            
            console.log(`[CLIENT-SAVE] Found pending save from ${Math.round(age/1000)}s ago`);
            
            // Restore the pending progress
            this.userProgress = saveData.userProgress;
            
            // Try to save again
            await this.saveProgress();
            
        } catch (error) {
            console.error('[CLIENT-SAVE] Error retrying pending save:', error);
        }
    }

    // Start health check monitoring
    startHealthCheck() {
        console.log('[HEALTH-CHECK] Starting server health monitoring...');
        
        // Check immediately
        this.checkServerHealth();
        
        // Then check every 30 seconds
        this.healthCheckInterval = setInterval(() => {
            this.checkServerHealth();
        }, 30000);
    }

    // Check server health
    async checkServerHealth() {
        try {
            const response = await fetch('/api/health', {
                method: 'GET',
                credentials: 'include',
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (response.ok) {
                if (!this.isServerHealthy) {
                    console.log('[HEALTH-CHECK] Server is back online!');
                    this.isServerHealthy = true;
                    this.hideServerWarning();
                    // Retry any pending saves
                    this.retryPendingSaves();
                }
            } else {
                this.handleServerUnhealthy();
            }
        } catch (error) {
            this.handleServerUnhealthy();
        }
    }

    handleServerUnhealthy() {
        if (this.isServerHealthy) {
            console.warn('[HEALTH-CHECK] Server appears to be down or deploying');
            this.isServerHealthy = false;
            this.showServerWarning();
        }
    }

    showServerWarning() {
        // Check if warning already exists
        if (document.getElementById('server-warning-banner')) return;
        
        const banner = document.createElement('div');
        banner.id = 'server-warning-banner';
        banner.innerHTML = `
            <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 12px 20px; text-align: center; font-weight: 600; position: fixed; top: 0; left: 0; right: 0; z-index: 2000; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
                <i class="fas fa-exclamation-triangle"></i> Server is temporarily unavailable. Your progress will be saved locally and synced when the connection is restored.
            </div>
        `;
        document.body.insertBefore(banner, document.body.firstChild);
        
        // Adjust body padding to account for banner
        document.body.style.paddingTop = '44px';
    }

    hideServerWarning() {
        const banner = document.getElementById('server-warning-banner');
        if (banner) {
            banner.remove();
            document.body.style.paddingTop = '0';
        }
    }

    loadFixQuests() {
        const container = document.getElementById('fix-quests-grid');
        
        if (!this.quests || this.quests.length === 0) {
            container.innerHTML = '<div style="padding: 60px; text-align: center; color: #888;">No quests loaded yet. Please wait...</div>';
            return;
        }
        
        // Show all quests for fixing
        const fixQuests = this.quests;
        
        // Build quest cards HTML
        const questsHTML = fixQuests.map(quest => {
            const questMap = quest.mapName || 'Any Location';
            const questTrader = quest.trader || 'Unknown';
            
            // Get description from objectives
            let description = 'No objectives available';
            try {
                const objectives = JSON.parse(quest.objectives || '[]');
                if (objectives.length > 0) {
                    const firstObjective = objectives[0];
                    if (typeof firstObjective === 'string') {
                        description = firstObjective;
                    } else if (firstObjective.description) {
                        description = firstObjective.description;
                    } else if (firstObjective.text) {
                        description = firstObjective.text;
                    }
                }
            } catch (e) {
                description = 'No objectives available';
            }
            
            return `
                <div class="fix-quest-card" data-quest-name="${quest.name.toLowerCase()}" data-trader="${questTrader.toLowerCase()}">
                    <div class="fix-quest-title">${quest.name}</div>
                    <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                        <span class="level-badge">Level ${quest.level}</span>
                        <span class="trader-badge">${questTrader}</span>
                        <span class="map-badge">${questMap}</span>
                        ${quest.requiredForKappa ? '<span class="kappa-badge">Kappa</span>' : ''}
                    </div>
                    <div style="color: #888; font-size: 14px; margin-bottom: 12px;">
                        ${description}
                    </div>
                    <button class="fix-quest-btn" onclick="openQuestEditDialog('${quest.id}')">
                        <i class="fas fa-wrench"></i> Fix Quest
                    </button>
                </div>
            `;
        }).join('');
        
        container.innerHTML = questsHTML;
    }

    async loadRankings() {
        const container = document.getElementById('rankings-content');
        container.innerHTML = '<div class="loading" style="padding: 60px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading rankings...</div>';
        
        try {
            const response = await fetch('/api/rankings?limit=100', { credentials: 'include' });
            const data = await response.json();
            
            if (!data.rankings || data.rankings.length === 0) {
                container.innerHTML = '<div style="padding: 60px; text-align: center; color: #888;">No rankings yet</div>';
                return;
            }
            
            // Store rankings data for sorting
            this.rankingsData = data.rankings;
            
            // Build rankings table HTML with toggles
            container.innerHTML = `
                <div style="padding: 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
                        <h2 style="color: #c7aa6a; font-size: 28px; margin: 0;">
                            <i class="fas fa-trophy"></i> Global Rankings for 16.9 Patch
                        </h2>
                        <div style="display: flex; gap: 15px; align-items: center;">
                            <label class="quest-mode-toggle" style="margin: 0;">
                                <input type="checkbox" id="leaderboard-toggle-dashboard" class="quest-mode-checkbox">
                                <span class="quest-mode-slider"></span>
                                <span class="quest-mode-label" id="leaderboard-label-dashboard">
                                    <i class="fas fa-skull-crossbones"></i> PVP
                                </span>
                            </label>
                        <label class="quest-mode-toggle" style="margin: 0;">
                            <input type="checkbox" id="include-prestige-dashboard" class="quest-mode-checkbox" checked>
                            <span class="quest-mode-slider"></span>
                                <span class="quest-mode-label">Sort by Prestige First</span>
                        </label>
                        </div>
                    </div>
                    <div id="rankings-table-wrapper">
                    <div style="background: rgba(30, 30, 30, 0.8); border: 2px solid #3a3a3a; border-radius: 12px; overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: rgba(199, 170, 106, 0.1);">
                                    <th style="padding: 15px; text-align: left; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a; width: 60px;">Rank</th>
                                    <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a; width: 60px;">Verified</th>
                                    <th style="padding: 15px; text-align: left; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Player</th>
                                    <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">PMC Level</th>
                                    <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Prestige</th>
                                    <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Quests Completed</th>
                                    <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Completion %</th>
                                    <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Last Active</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.rankings.map((user, index) => {
                                    const rank = index + 1;
                                    const displayName = user.displayName || user.username;
                                    const rankColor = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#c7aa6a';
                                    const lastActive = user.progress.lastQuestDate 
                                        ? this.formatTimeAgo(new Date(user.progress.lastQuestDate)) 
                                        : 'Never';
                                    
                                    return `
                                        <tr style="border-bottom: 1px solid #2a2a2a; transition: background 0.2s;">
                                            <td style="padding: 15px; color: ${rankColor}; font-weight: 700; font-size: 18px;">#${rank}</td>
                                            <td style="padding: 15px; text-align: center;">
                                                ${user.verified ? '<i class="fas fa-circle-check" style="color: #2196F3; font-size: 20px;" title="User is streaming his Kappa Progress on Twitch."></i>' : ''}
                                            </td>
                                            <td style="padding: 15px;">
                                                <div style="display: flex; align-items: center; gap: 12px;">
                                                    ${user.avatarUrl ? `
                                                        <img src="${user.avatarUrl}" alt="${displayName}" 
                                                             style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #c7aa6a;" 
                                                             loading="lazy"
                                                             onerror="handleBrokenAvatar(this, '${displayName.replace(/'/g, "\\'")}')" >
                                                    ` : `
                                                        <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(30, 30, 30, 0.8); border: 2px solid #c7aa6a; display: flex; align-items: center; justify-content: center; color: #c7aa6a; font-size: 24px;">
                                                            <i class="fas fa-user"></i>
                                                        </div>
                                                    `}
                                                    <div>
                                                        <a href="/public-profile?user=${user.username}" style="color: #fff; font-weight: 600; font-size: 16px; text-decoration: none; cursor: pointer;">
                                                            ${displayName}
                                                        </a>
                                                        <div style="color: #888; font-size: 14px;">@${user.username}</div>
                                                        <div style="margin-top: 5px; display: flex; gap: 10px; flex-wrap: wrap;">
                                                            ${user.twitchUrl ? `
                                                                <a href="${user.twitchUrl}" target="_blank" style="color: #888; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                                                                    <i class="fab fa-twitch"></i> Twitch
                                                                </a>
                                                            ` : ''}
                                                            ${user.tarkovDevId ? `
                                                                <a href="https://tarkov.dev/player/${user.tarkovDevId}" target="_blank" style="color: #888; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                                                                    <i class="fas fa-gamepad"></i> Tarkov.dev
                                                                </a>
                                                            ` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style="padding: 15px; text-align: center; color: #fff; font-weight: 600; font-size: 16px;">${user.progress.pmcLevel}</td>
                                            <td style="padding: 15px; text-align: center;">
                                                ${user.progress.prestige === -1 ? `
                                                    <span style="color: #c7aa6a; font-weight: 600; font-size: 16px;">PVE</span>
                                                ` : user.progress.prestige && user.progress.prestige > 0 ? `
                                                    <img src="/imgs/prestige_${user.progress.prestige}.webp" alt="Prestige ${user.progress.prestige}" style="width: 40px; height: 40px; object-fit: contain;" title="Prestige ${user.progress.prestige}" loading="lazy" />
                                                ` : `<span style="color: #888; font-size: 14px;">-</span>`}
                                            </td>
                                            <td style="padding: 15px; text-align: center; color: #fff; font-weight: 600; font-size: 16px;">${user.progress.totalCompleted}</td>
                                            <td style="padding: 15px; text-align: center; color: #4CAF50; font-weight: 700; font-size: 18px;">${user.progress.completionRate.toFixed(1)}%</td>
                                            <td style="padding: 15px; text-align: center; color: #888; font-size: 14px;">${lastActive}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    </div>
                </div>
            `;
            
            // Check Twitch live status
            await this.checkTwitchLiveStatus();
            
            // Render with default sorting (PVP, include prestige = true)
            this.renderRankings(false, true);
            
            // Setup toggle event listeners
            const leaderboardToggle = document.getElementById('leaderboard-toggle-dashboard');
            const prestigeToggle = document.getElementById('include-prestige-dashboard');
            
            if (leaderboardToggle) {
                leaderboardToggle.addEventListener('change', () => {
                    this.renderRankings(leaderboardToggle.checked, prestigeToggle.checked);
                });
            }
            
            if (prestigeToggle) {
                prestigeToggle.addEventListener('change', () => {
                    this.renderRankings(leaderboardToggle.checked, prestigeToggle.checked);
                });
            }
        } catch (error) {
            console.error('Error loading rankings:', error);
            container.innerHTML = '<div style="padding: 60px; text-align: center; color: #ef4444;">Failed to load rankings</div>';
        }
    }
    
    async checkTwitchLiveStatus() {
        if (!this.rankingsData || this.rankingsData.length === 0) return;
        
        // Get all Twitch usernames
        const twitchNames = this.rankingsData
            .filter(user => user.twitchName)
            .map(user => user.twitchName);
        
        if (twitchNames.length === 0) return;
        
        try {
            const response = await fetch('/api/twitch/check-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ twitchNames })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.twitchLiveUsers = data.liveUsers || {};
            }
        } catch (error) {
            console.error('Error checking Twitch live status:', error);
            this.twitchLiveUsers = {};
        }
    }

    renderRankings(isPVE, includePrestige) {
        if (!this.rankingsData) return;
        
        // Update label
        const label = document.getElementById('leaderboard-label-dashboard');
        if (label) {
            if (isPVE) {
                label.innerHTML = '<i class="fas fa-shield-alt"></i> PVE';
            } else {
                label.innerHTML = '<i class="fas fa-skull-crossbones"></i> PVP';
            }
        }
        
        // Filter rankings based on leaderboard type
        const filtered = this.rankingsData.filter(user => {
            // Exclude users with 0% progression
            if (user.progress.completionRate === 0) {
                return false;
            }
            
            if (isPVE) {
                // PVE leaderboard: only users with prestige -1
                return user.progress.prestige === -1;
            } else {
                // PVP leaderboard: users with prestige >= 0 (0, 1, 2, 3, 4)
                return user.progress.prestige !== -1;
            }
        });
        
        // Check if there are any users in this leaderboard
        if (filtered.length === 0) {
            const wrapper = document.getElementById('rankings-table-wrapper');
            if (wrapper) {
                wrapper.innerHTML = `
                    <div style="padding: 60px; text-align: center; color: #888;">
                        <i class="fas fa-trophy" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
                        <p>No ${isPVE ? 'PVE' : 'PVP'} players yet. Be the first!</p>
                    </div>
                `;
            }
            return;
        }
        
        // Sort rankings based on toggle and leaderboard type
        const sorted = [...filtered].sort((a, b) => {
            if (!isPVE && includePrestige) {
                // PVP with Prestige First: Sort by Prestige > Completion % > Level
                const prestigeA = a.progress.prestige || 0;
                const prestigeB = b.progress.prestige || 0;
                if (prestigeB !== prestigeA) return prestigeB - prestigeA;
                
                const completionA = a.progress.completionRate;
                const completionB = b.progress.completionRate;
                if (completionB !== completionA) return completionB - completionA;
                
                return b.progress.pmcLevel - a.progress.pmcLevel;
            } else {
                // Default (both PVP and PVE): Sort by Completion % > Prestige > Level
                const completionA = a.progress.completionRate;
                const completionB = b.progress.completionRate;
                if (completionB !== completionA) return completionB - completionA;
                
                const prestigeA = a.progress.prestige || 0;
                const prestigeB = b.progress.prestige || 0;
                if (prestigeB !== prestigeA) return prestigeB - prestigeA;
                
                return b.progress.pmcLevel - a.progress.pmcLevel;
            }
        });
        
        // Render sorted table
        const tableWrapper = document.getElementById('rankings-table-wrapper');
        if (!tableWrapper) return;
        
        tableWrapper.innerHTML = `
            <div style="background: rgba(30, 30, 30, 0.8); border: 2px solid #3a3a3a; border-radius: 12px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: rgba(199, 170, 106, 0.1);">
                            <th style="padding: 15px; text-align: left; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a; width: 60px;">Rank</th>
                            <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a; width: 60px;">Verified</th>
                            <th style="padding: 15px; text-align: left; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Player</th>
                            <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">PMC Level</th>
                            <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Prestige</th>
                            <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Quests Completed</th>
                            <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Completion %</th>
                            <th style="padding: 15px; text-align: center; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Last Active</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map((user, index) => {
                            const rank = index + 1;
                            const displayName = user.displayName || user.username;
                            const rankColor = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#c7aa6a';
                            const lastActive = user.progress.lastQuestDate 
                                ? this.formatTimeAgo(new Date(user.progress.lastQuestDate)) 
                                : 'Never';
                            
                            return `
                                <tr style="border-bottom: 1px solid #2a2a2a; transition: background 0.2s;">
                                    <td style="padding: 15px; color: ${rankColor}; font-weight: 700; font-size: 18px;">#${rank}</td>
                                    <td style="padding: 15px; text-align: center;">
                                        ${user.verified ? '<i class="fas fa-circle-check" style="color: #2196F3; font-size: 20px;" title="User is streaming his Kappa Progress on Twitch."></i>' : ''}
                                    </td>
                                    <td style="padding: 15px;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            ${user.avatarUrl ? `
                                                <img src="${user.avatarUrl}" alt="${displayName}" 
                                                     style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #c7aa6a;" 
                                                     loading="lazy"
                                                     onerror="this.style.display='none'">
                                            ` : `
                                                <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(30, 30, 30, 0.8); border: 2px solid #c7aa6a; display: flex; align-items: center; justify-content: center; color: #c7aa6a; font-size: 24px;">
                                                    <i class="fas fa-user"></i>
                                                </div>
                                            `}
                                            <div>
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    <a href="${user.twitchUrl || `/public-profile?user=${user.username}`}" target="_blank" style="color: ${user.profileColor || '#c7aa6a'}; font-weight: 600; font-size: 16px; text-decoration: none; cursor: pointer;">
                                                        ${displayName}
                                                    </a>
                                                    ${(this.twitchLiveUsers && user.twitchName && this.twitchLiveUsers[user.twitchName.toLowerCase()]) ? `
                                                        <span style="background: #e91916; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 4px; animation: pulse 2s infinite;">
                                                            <span style="width: 6px; height: 6px; background: #fff; border-radius: 50%; display: inline-block;"></span>
                                                            LIVE
                                                        </span>
                                                    ` : ''}
                                                </div>
                                                <div style="margin-top: 5px; display: flex; gap: 10px; flex-wrap: wrap;">
                                                    ${user.tarkovDevId ? `
                                                        <a href="https://tarkov.dev/player/${user.tarkovDevId}" target="_blank" style="color: #888; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                                                            <i class="fas fa-gamepad"></i> Tarkov.dev
                                                        </a>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style="padding: 15px; text-align: center; color: #fff; font-weight: 600; font-size: 16px;">${user.progress.pmcLevel}</td>
                                    <td style="padding: 15px; text-align: center;">
                                        ${user.progress.prestige === -1 ? `
                                            <span style="color: #c7aa6a; font-weight: 600; font-size: 16px;">PVE</span>
                                        ` : user.progress.prestige && user.progress.prestige > 0 ? `
                                            <img src="/imgs/prestige_${user.progress.prestige}.webp" alt="Prestige ${user.progress.prestige}" style="width: 40px; height: 40px; object-fit: contain;" title="Prestige ${user.progress.prestige}" loading="lazy" />
                                        ` : `<span style="color: #888; font-size: 14px;">-</span>`}
                                    </td>
                                    <td style="padding: 15px; text-align: center; color: #fff; font-weight: 600; font-size: 16px;">${user.progress.totalCompleted}</td>
                                    <td style="padding: 15px; text-align: center; color: #4CAF50; font-weight: 700; font-size: 18px;">${user.progress.completionRate.toFixed(1)}%</td>
                                    <td style="padding: 15px; text-align: center; color: #888; font-size: 14px;">${lastActive}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadProfile() {
        const container = document.getElementById('profile-content');
        container.innerHTML = '<div class="loading" style="padding: 60px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading profile...</div>';
        
        try {
            const response = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await response.json();
            const user = data.user;
            
            // Build profile HTML
            container.innerHTML = `
                <div style="padding: 20px; display: flex; justify-content: center;">
                    <div style="max-width: 800px; width: 100%;">
                        <h2 style="color: #c7aa6a; font-size: 28px; margin-bottom: 20px;">
                            <i class="fas fa-user"></i> Account
                        </h2>
                        
                        <div style="background: rgba(30, 30, 30, 0.8); border: 2px solid #3a3a3a; border-radius: 12px; padding: 30px;">
                            <h3 style="color: #c7aa6a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #3a3a3a; padding-bottom: 10px;">Account Information</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div>
                                <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Username</div>
                                <div style="color: #fff; font-size: 18px; font-weight: 600;">${user.username}</div>
                            </div>
                            <div>
                                <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Display Name</div>
                                <div style="color: #fff; font-size: 18px; font-weight: 600;">${user.displayName || 'Not set'}</div>
                            </div>
                            <div>
                                <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Email</div>
                                <div style="color: #fff; font-size: 16px;">${user.email}</div>
                            </div>
                            <div>
                                <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Member Since</div>
                                <div style="color: #fff; font-size: 16px;">${new Date(user.createdAt).toLocaleDateString()}</div>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #3a3a3a; padding-top: 20px; margin-bottom: 20px;">
                            <h4 style="color: #c7aa6a; font-size: 16px; margin-bottom: 15px;">
                                <i class="fas fa-palette"></i> Profile Color
                            </h4>
                            <div style="color: #888; font-size: 14px; margin-bottom: 10px;">Choose a color for your username in statistics and rankings</div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input 
                                    type="color" 
                                    id="profile-color-picker" 
                                    value="${user.profileColor || '#c7aa6a'}"
                                    style="width: 80px; height: 40px; cursor: pointer; border-radius: 6px; border: 2px solid #3a3a3a; background: transparent;"
                                />
                                <input 
                                    type="text" 
                                    id="profile-color-hex" 
                                    value="${user.profileColor || '#c7aa6a'}" 
                                    maxlength="7"
                                    placeholder="#c7aa6a"
                                    style="flex: 1; padding: 10px 15px; background: rgba(20, 20, 20, 0.8); border: 2px solid #3a3a3a; border-radius: 8px; color: #fff; font-size: 16px; font-family: monospace;"
                                />
                                <button 
                                    id="save-profile-color-btn" 
                                    style="padding: 10px 20px; background: #c7aa6a; color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 16px; transition: background 0.2s;"
                                    onmouseover="this.style.background='#d4ba7f'"
                                    onmouseout="this.style.background='#c7aa6a'"
                                >
                                    <i class="fas fa-save"></i> Save
                                </button>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #3a3a3a; padding-top: 20px; margin-bottom: 20px;">
                            <h4 style="color: #c7aa6a; font-size: 16px; margin-bottom: 15px;">
                                <i class="fab fa-twitch"></i> Twitch Integration
                            </h4>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input 
                                    type="text" 
                                    id="twitch-name-input" 
                                    value="${user.twitchName || ''}" 
                                    placeholder="Enter your Twitch username"
                                    style="flex: 1; padding: 10px 15px; background: rgba(20, 20, 20, 0.8); border: 2px solid #3a3a3a; border-radius: 8px; color: #fff; font-size: 16px;"
                                />
                                <button 
                                    id="save-twitch-btn" 
                                    style="padding: 10px 20px; background: #6441a5; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 16px; transition: background 0.2s;"
                                    onmouseover="this.style.background='#7d5bbe'"
                                    onmouseout="this.style.background='#6441a5'"
                                >
                                    <i class="fas fa-save"></i> Save
                                </button>
                            </div>
                            ${user.twitchName ? `
                                <div style="margin-top: 10px; color: #4CAF50; font-size: 14px;">
                                    <i class="fas fa-check-circle"></i> 
                                    Your Twitch: <a href="https://twitch.tv/${user.twitchName}" target="_blank" style="color: #6441a5; text-decoration: none; font-weight: 600;">twitch.tv/${user.twitchName}</a>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div style="border-top: 1px solid #3a3a3a; padding-top: 20px; margin-bottom: 20px;">
                            <h4 style="color: #c7aa6a; font-size: 16px; margin-bottom: 15px;">
                                <i class="fas fa-gamepad"></i> Tarkov.dev Profile ID
                            </h4>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input 
                                    type="text" 
                                    id="tarkovdev-id-input" 
                                    value="${user.tarkovDevId || ''}" 
                                    placeholder="Enter your Tarkov.dev ID"
                                    style="flex: 1; padding: 10px 15px; background: rgba(20, 20, 20, 0.8); border: 2px solid #3a3a3a; border-radius: 8px; color: #fff; font-size: 16px;"
                                />
                                <button 
                                    id="save-tarkovdev-btn" 
                                    style="padding: 10px 20px; background: #c7aa6a; color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 16px; transition: background 0.2s;"
                                    onmouseover="this.style.background='#d4ba7f'"
                                    onmouseout="this.style.background='#c7aa6a'"
                                >
                                    <i class="fas fa-save"></i> Save
                                </button>
                            </div>
                            ${user.tarkovDevId ? `
                                <div style="margin-top: 10px; color: #4CAF50; font-size: 14px;">
                                    <i class="fas fa-check-circle"></i> 
                                    Your Profile: <a href="https://tarkov.dev/player/${user.tarkovDevId}" target="_blank" style="color: #c7aa6a; text-decoration: none; font-weight: 600;">tarkov.dev/player/${user.tarkovDevId}</a>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div style="border-top: 1px solid #3a3a3a; padding-top: 20px; margin-bottom: 20px;">
                            <h4 style="color: #c7aa6a; font-size: 16px; margin-bottom: 15px;">
                                <i class="fas fa-tv"></i> Collector Progress Overlay Settings
                            </h4>
                            <div style="color: #888; font-size: 14px; margin-bottom: 15px;">Customize how your collector progress overlay appears in OBS</div>
                            
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; color: #c7aa6a; font-size: 14px; margin-bottom: 8px; font-weight: 600;">Title</label>
                                <input 
                                    type="text" 
                                    id="collector-title-input" 
                                    value="Kappa Progress" 
                                    maxlength="50"
                                    placeholder="Kappa Progress"
                                    style="width: 100%; padding: 10px 15px; background: rgba(20, 20, 20, 0.8); border: 2px solid #3a3a3a; border-radius: 8px; color: #fff; font-size: 16px;"
                                />
                                <div style="color: #666; font-size: 12px; margin-top: 5px;">The title shown on your overlay</div>
                            </div>
                            
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; color: #c7aa6a; font-size: 14px; margin-bottom: 8px; font-weight: 600;">Style</label>
                                <select 
                                    id="collector-style-select"
                                    style="width: 100%; padding: 10px 15px; background: rgba(20, 20, 20, 0.8); border: 2px solid #3a3a3a; border-radius: 8px; color: #fff; font-size: 16px; cursor: pointer;"
                                >
                                    <option value="Bosses">Bosses</option>
                                    <option value="Maps">Maps</option>
                                    <option value="Transparent">Transparent</option>
                                </select>
                                <div style="color: #666; font-size: 12px; margin-top: 5px;">Visual style for your overlay</div>
                            </div>
                            
                            <div style="margin-bottom: 15px;" id="collector-align-container">
                                <label style="display: block; color: #c7aa6a; font-size: 14px; margin-bottom: 8px; font-weight: 600;">Text Alignment</label>
                                <select 
                                    id="collector-align-select"
                                    style="width: 100%; padding: 10px 15px; background: rgba(20, 20, 20, 0.8); border: 2px solid #3a3a3a; border-radius: 8px; color: #fff; font-size: 16px; cursor: pointer;"
                                >
                                    <option value="left">Left</option>
                                    <option value="center">Center</option>
                                    <option value="right">Right</option>
                                </select>
                                <div style="color: #666; font-size: 12px; margin-top: 5px;">Text alignment for the progress display (only for Transparent style)</div>
                            </div>
                            
                            <div style="margin-bottom: 15px;">
                                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #c7aa6a; font-size: 14px; font-weight: 600;">
                                    <input 
                                        type="checkbox" 
                                        id="collector-show-rank-checkbox"
                                        style="width: 20px; height: 20px; cursor: pointer;"
                                    />
                                    <span>Show my leaderboard position</span>
                                </label>
                                <div style="color: #666; font-size: 12px; margin-top: 5px; margin-left: 30px;">Display your rank (#x on obs-kappa-tracker.com) below the progress</div>
                            </div>
                            
                            <button 
                                id="save-collector-settings-btn" 
                                style="padding: 10px 20px; background: #c7aa6a; color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 16px; transition: background 0.2s; width: 100%;"
                                onmouseover="this.style.background='#d4ba7f'"
                                onmouseout="this.style.background='#c7aa6a'"
                            >
                                <i class="fas fa-save"></i> Save Overlay Settings
                            </button>
                        </div>
                        
                        </div>
                    </div>
                </div>
            `;
            
            // Sync profile color picker and hex input
            const colorPicker = document.getElementById('profile-color-picker');
            const colorHex = document.getElementById('profile-color-hex');
            if (colorPicker && colorHex) {
                colorPicker.addEventListener('input', (e) => {
                    colorHex.value = e.target.value.toUpperCase();
                });
                colorHex.addEventListener('input', (e) => {
                    const hex = e.target.value;
                    if (/^#[0-9A-F]{6}$/i.test(hex)) {
                        colorPicker.value = hex;
                    }
                });
            }
            
            // Add event listener for profile color save button
            const saveProfileColorBtn = document.getElementById('save-profile-color-btn');
            if (saveProfileColorBtn) {
                saveProfileColorBtn.addEventListener('click', async () => {
                    const profileColor = document.getElementById('profile-color-picker').value;
                    
                    try {
                        saveProfileColorBtn.disabled = true;
                        saveProfileColorBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                        
                        const response = await fetch(`/api/users/${user.username}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ profileColor })
                        });
                        
                        if (response.ok) {
                            this.showNotification('Profile color saved successfully!', 'success');
                            setTimeout(() => this.loadProfile(), 500);
                        } else {
                            throw new Error('Failed to save');
                        }
                    } catch (error) {
                        console.error('Error saving profile color:', error);
                        this.showNotification('Failed to save profile color', 'error');
                        saveProfileColorBtn.disabled = false;
                        saveProfileColorBtn.innerHTML = '<i class="fas fa-save"></i> Save';
                    }
                });
            }
            
            // Add event listener for save button
            const saveTwitchBtn = document.getElementById('save-twitch-btn');
            if (saveTwitchBtn) {
                saveTwitchBtn.addEventListener('click', async () => {
                    const twitchNameInput = document.getElementById('twitch-name-input');
                    const twitchName = twitchNameInput.value.trim();
                    
                    try {
                        saveTwitchBtn.disabled = true;
                        saveTwitchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                        
                        const response = await fetch('/api/user/update-twitch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ twitchName })
                        });
                        
                        if (response.ok) {
                            this.showNotification('Twitch name saved successfully!', 'success');
                            // Reload profile to show updated link
                            setTimeout(() => this.loadProfile(), 500);
                        } else {
                            throw new Error('Failed to save');
                        }
                    } catch (error) {
                        console.error('Error saving Twitch name:', error);
                        this.showNotification('Failed to save Twitch name', 'error');
                        saveTwitchBtn.disabled = false;
                        saveTwitchBtn.innerHTML = '<i class="fas fa-save"></i> Save';
                    }
                });
            }
            
            // Add event listener for Tarkov.dev ID save button
            const saveTarkovDevBtn = document.getElementById('save-tarkovdev-btn');
            if (saveTarkovDevBtn) {
                saveTarkovDevBtn.addEventListener('click', async () => {
                    const tarkovDevIdInput = document.getElementById('tarkovdev-id-input');
                    const tarkovDevId = tarkovDevIdInput.value.trim();
                    
                    try {
                        saveTarkovDevBtn.disabled = true;
                        saveTarkovDevBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                        
                        const response = await fetch(`/api/users/${user.username}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ tarkovDevId })
                        });
                        
                        if (response.ok) {
                            this.showNotification('Tarkov.dev ID saved successfully!', 'success');
                            setTimeout(() => this.loadProfile(), 500);
                        } else {
                            throw new Error('Failed to save');
                        }
                    } catch (error) {
                        console.error('Error saving Tarkov.dev ID:', error);
                        this.showNotification('Failed to save Tarkov.dev ID', 'error');
                        saveTarkovDevBtn.disabled = false;
                        saveTarkovDevBtn.innerHTML = '<i class="fas fa-save"></i> Save';
                    }
                });
            }
            
            // Load collector overlay settings
            const loadCollectorSettings = async () => {
                try {
                    const response = await fetch('/api/progress', { credentials: 'include' });
                    if (response.ok) {
                        const progress = await response.json();
                        document.getElementById('collector-title-input').value = progress.collectorTitle || 'Kappa Progress';
                        document.getElementById('collector-style-select').value = progress.collectorStyle || 'Bosses';
                        document.getElementById('collector-align-select').value = progress.collectorTextAlign || 'left';
                        document.getElementById('collector-show-rank-checkbox').checked = progress.collectorShowRank || false;
                        
                        // Update text align state based on initial style
                        toggleTextAlignAvailability(progress.collectorStyle || 'Bosses');
                    }
                } catch (error) {
                    console.error('Error loading collector settings:', error);
                }
            };
            loadCollectorSettings();
            
            // Function to toggle text align availability based on style
            const toggleTextAlignAvailability = (style) => {
                const alignSelect = document.getElementById('collector-align-select');
                const alignContainer = document.getElementById('collector-align-container');
                
                if (style === 'Bosses' || style === 'Maps') {
                    alignSelect.disabled = true;
                    alignSelect.style.opacity = '0.5';
                    alignSelect.style.cursor = 'not-allowed';
                    alignContainer.style.opacity = '0.5';
                } else {
                    alignSelect.disabled = false;
                    alignSelect.style.opacity = '1';
                    alignSelect.style.cursor = 'pointer';
                    alignContainer.style.opacity = '1';
                }
            };
            
            // Add event listener to style select to toggle text align
            const styleSelect = document.getElementById('collector-style-select');
            if (styleSelect) {
                styleSelect.addEventListener('change', (e) => {
                    toggleTextAlignAvailability(e.target.value);
                });
            }
            
            // Add event listener for collector settings save button
            const saveCollectorSettingsBtn = document.getElementById('save-collector-settings-btn');
            if (saveCollectorSettingsBtn) {
                saveCollectorSettingsBtn.addEventListener('click', async () => {
                    const collectorTitle = document.getElementById('collector-title-input').value;
                    const collectorStyle = document.getElementById('collector-style-select').value;
                    const collectorTextAlign = document.getElementById('collector-align-select').value;
                    const collectorShowRank = document.getElementById('collector-show-rank-checkbox').checked;
                    
                    try {
                        saveCollectorSettingsBtn.disabled = true;
                        saveCollectorSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                        
                        const response = await fetch('/api/progress/collector-settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ collectorTitle, collectorStyle, collectorTextAlign, collectorShowRank })
                        });
                        
                        if (response.ok) {
                            this.showNotification('Collector overlay settings saved successfully!', 'success');
                        } else {
                            throw new Error('Failed to save');
                        }
                    } catch (error) {
                        console.error('Error saving collector settings:', error);
                        this.showNotification('Failed to save collector settings', 'error');
                    } finally {
                        saveCollectorSettingsBtn.disabled = false;
                        saveCollectorSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Save Overlay Settings';
                    }
                });
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            container.innerHTML = '<div style="padding: 60px; text-align: center; color: #ef4444;">Failed to load profile</div>';
        }
    }

    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        const intervals = [
            { label: 'year', seconds: 31536000 },
            { label: 'month', seconds: 2592000 },
            { label: 'day', seconds: 86400 },
            { label: 'hour', seconds: 3600 },
            { label: 'minute', seconds: 60 }
        ];
        
        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count >= 1) {
                return count === 1 ? `1 ${interval.label} ago` : `${count} ${interval.label}s ago`;
            }
        }
        
        return 'just now';
    }
}

// ============================================================================
// STATISTICS MANAGER
// ============================================================================

class StatisticsManager {
    constructor() {
        this.chartInstance = null;
        this.activityData = [];
        this.compareMode = false;
        this.allUsers = [];
        this.selectedUsers = new Set();
        this.userColors = {};
        this.colors = [
            '#c7aa6a', '#4169e1', '#dc143c', '#32cd32', '#ff69b4',
            '#ffa500', '#9370db', '#00ced1', '#ff6347', '#98fb98'
        ];
    }

    async init() {
        // Restore saved user selections from localStorage
        this.loadSavedSelections();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load initial data (always in compare mode)
        await this.loadData(true);
    }

    loadSavedSelections() {
        try {
            const saved = localStorage.getItem('statistics_selected_users');
            if (saved) {
                const usernames = JSON.parse(saved);
                this.selectedUsers = new Set(usernames);
                console.log('Restored selected users:', Array.from(this.selectedUsers));
            }
        } catch (error) {
            console.error('Error loading saved selections:', error);
        }
    }

    saveSelections() {
        try {
            const usernames = Array.from(this.selectedUsers);
            localStorage.setItem('statistics_selected_users', JSON.stringify(usernames));
            console.log('Saved selected users:', usernames);
        } catch (error) {
            console.error('Error saving selections:', error);
        }
    }

    setupEventListeners() {
        const userSelectorContainer = document.getElementById('user-selector-container');
        const userSelectorBtn = document.getElementById('user-selector-btn');
        const userSelectorMenu = document.getElementById('user-selector-menu');

        // User selector dropdown toggle
        if (userSelectorBtn && userSelectorMenu) {
            userSelectorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                userSelectorMenu.classList.toggle('show');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!userSelectorContainer?.contains(e.target)) {
                    userSelectorMenu.classList.remove('show');
                }
            });
        }
    }

    async loadData(compareMode = true) {
        try {
            console.log('Loading statistics data');
            const url = '/api/statistics?compare=true';
            const response = await fetch(url, { credentials: 'include' });
            
            if (!response.ok) throw new Error('Failed to fetch statistics');
            
            const data = await response.json();
            console.log('Statistics data received:', data);
            
            // Assign colors to users BEFORE initializing chart
            this.allUsers = data.users;
            data.users.forEach((user, index) => {
                // Use user's profile color if available, otherwise use default colors
                const color = user.profileColor || this.colors[index % this.colors.length];
                this.userColors[user.username] = color;
            });
            console.log('User colors assigned:', this.userColors);
            
            // Default to only current user selected if no saved selections
            // MUST happen BEFORE initChart so the chart has data to display
            if (this.selectedUsers.size === 0 && window.currentUser) {
                this.selectedUsers.add(window.currentUser.username);
                this.saveSelections(); // Save the default
            }
            
            // Initialize chart
            try {
                this.initChart(data, true);
                console.log('Chart initialized successfully');
            } catch (chartError) {
                console.error('Error initializing chart:', chartError);
            }
            
            // Populate user selector
            this.populateUserSelector(data.users);
            this.updateLegend();
            
            // Flatten all activities from all users
            const allActivities = data.users.flatMap(u => u.activities || []);
            allActivities.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
            this.activityData = allActivities;
            this.renderActivityLog(allActivities, true);
            console.log('Rendered activity log with', allActivities.length, 'activities (compare mode)');
        } catch (error) {
            console.error('Error loading statistics:', error);
            // Show error message in activity log
            const logContainer = document.getElementById('activity-log');
            if (logContainer) {
                logContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load statistics</p>
                        <p style="font-size: 0.85rem; color: var(--subtext);">${error.message}</p>
                    </div>
                `;
            }
        }
    }

    initChart(data, compareMode = true) {
        const canvas = document.getElementById('questProgressChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const datasets = [];
        
        // Multi-user mode - only show selected users
        data.users.forEach((userData) => {
            // Only include if user is selected
            if (!this.selectedUsers.has(userData.username)) return;
            
            const color = this.userColors[userData.username];
            const isCurrentUser = userData.username === window.currentUser?.username;
            
            // Aggregate nearby points (within 1 hour) to reduce clutter
            const aggregatedData = this.aggregateDataPoints(userData.progressData, 60 * 60 * 1000); // 1 hour in ms
            
            datasets.push({
                label: userData.displayName || userData.username,
                data: aggregatedData,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: isCurrentUser ? 3 : 2,
                tension: 0, // Straight lines, no bezier curves
                fill: false,
                pointRadius: isCurrentUser ? 4 : 3,
                pointHoverRadius: isCurrentUser ? 6 : 5
            });
        });

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        position: 'nearest',
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#c7aa6a',
                        bodyColor: '#fff',
                        borderColor: '#c7aa6a',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            title: function(context) {
                                const date = new Date(context[0].parsed.x);
                                return date.toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            },
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y} quests`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: { day: 'MMM d' }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#888',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#888',
                            font: { size: 11 },
                            stepSize: 10
                        },
                        title: {
                            display: true,
                            text: 'Total Quests Completed',
                            color: '#c7aa6a',
                            font: { size: 12, weight: 'bold' }
                        }
                    }
                }
            }
        });
    }

    populateUserSelector(users) {
        const menu = document.getElementById('user-selector-menu');
        if (!menu) return;

        const searchBoxHtml = `
            <div style="padding: 8px 12px; border-bottom: 1px solid var(--post-border); position: sticky; top: 0; background: var(--post-bg); z-index: 1;">
                <input type="text" 
                       id="user-search-input" 
                       placeholder="Search users..." 
                       style="width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--post-border); border-radius: 4px; color: var(--text); font-size: 14px;"
                       autocomplete="off">
            </div>
        `;

        const userItemsHtml = users.map(user => {
            const color = this.userColors[user.username];
            const isSelected = this.selectedUsers.has(user.username);
            const isCurrentUser = user.username === window.currentUser?.username;
            const displayName = (user.displayName || user.username) + (isCurrentUser ? ' (You)' : '');
            
            return `
                <div class="user-checkbox-item" data-username="${user.username.toLowerCase()}" data-displayname="${(user.displayName || user.username).toLowerCase()}">
                    <input type="checkbox" 
                           id="user-${user.username}" 
                           ${isSelected ? 'checked' : ''}
                           data-username="${user.username}">
                    <div class="user-color-indicator" style="background: ${color};"></div>
                    <label class="user-checkbox-label" for="user-${user.username}">
                        ${displayName}
                    </label>
                </div>
            `;
        }).join('');

        menu.innerHTML = searchBoxHtml + userItemsHtml;

        // Add search functionality
        const searchInput = document.getElementById('user-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                menu.querySelectorAll('.user-checkbox-item').forEach(item => {
                    const username = item.dataset.username || '';
                    const displayname = item.dataset.displayname || '';
                    const matches = username.includes(searchTerm) || displayname.includes(searchTerm);
                    item.style.display = matches ? 'flex' : 'none';
                });
            });
        }

        // Add event listeners to checkboxes
        menu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const username = e.target.dataset.username;
                if (e.target.checked) {
                    this.selectedUsers.add(username);
                } else {
                    this.selectedUsers.delete(username);
                }
                // Save selections to localStorage
                this.saveSelections();
                // Update legend
                this.updateLegend();
                // Reload chart with updated selection
                this.loadData(true);
            });
        });
    }

    updateLegend() {
        const legendContainer = document.getElementById('user-legend');
        if (!legendContainer) return;

        if (this.selectedUsers.size === 0) {
            legendContainer.innerHTML = '<div style="color: var(--subtext); font-size: 0.85rem; text-align: center;">No users selected. Select users from the dropdown above to compare their progress.</div>';
            return;
        }

        const legendItems = Array.from(this.selectedUsers).map(username => {
            const color = this.userColors[username] || '#888';
            const user = this.allUsers.find(u => u.username === username);
            const displayName = user ? (user.displayName || user.username) : username;
            const isCurrentUser = username === window.currentUser?.username;
            
            return `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${color};"></div>
                    <span class="legend-name">${displayName}${isCurrentUser ? ' (You)' : ''}</span>
                </div>
            `;
        }).join('');

        legendContainer.innerHTML = legendItems;
    }

    renderActivityLog(activities, compareMode = false) {
        const logContainer = document.getElementById('activity-log');
        if (!logContainer) return;

        if (!activities || activities.length === 0) {
            logContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No quest completions yet</p>
                </div>
            `;
            return;
        }

        // Filter activities based on selected users from the graph
        let filteredActivities = activities;
        if (compareMode && this.selectedUsers.size > 0) {
            filteredActivities = activities.filter(a => this.selectedUsers.has(a.username));
        }

        // Limit to 100 most recent activities for performance
        const limitedActivities = filteredActivities.slice(0, 100);
        
        logContainer.innerHTML = limitedActivities.map(activity => {
            const date = new Date(activity.completedAt);
            const timeAgo = this.getTimeAgo(date);
            const isCurrentUser = activity.username === window.currentUser?.username;
            const userColor = this.userColors[activity.username] || '#c7aa6a';
            
            return `
                <div class="activity-item ${isCurrentUser ? 'current-user' : ''}" style="border-left-color: ${userColor};">
                    <div class="activity-icon" style="background: ${userColor};">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-header">
                            ${compareMode ? `<span class="activity-user" style="color: ${userColor};">${activity.displayName || activity.username}</span>` : ''}
                            <span class="activity-quest">${activity.questName}</span>
                        </div>
                        <div class="activity-meta">
                            <span class="activity-trader">
                                <i class="fas fa-user-tie"></i> ${activity.trader}
                            </span>
                            <span class="activity-time">
                                <i class="fas fa-clock"></i> ${timeAgo}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Show count if limited
        if (filteredActivities.length > 100) {
            console.log(`Showing 100 of ${filteredActivities.length} activities`);
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }
        return 'Just now';
    }

    aggregateDataPoints(dataPoints, timeWindowMs) {
        if (!dataPoints || dataPoints.length === 0) return [];
        
        const aggregated = [];
        let currentGroup = [dataPoints[0]];
        
        for (let i = 1; i < dataPoints.length; i++) {
            const currentTime = new Date(dataPoints[i].x).getTime();
            const lastTime = new Date(currentGroup[currentGroup.length - 1].x).getTime();
            
            // If within time window, add to current group
            if (currentTime - lastTime <= timeWindowMs) {
                currentGroup.push(dataPoints[i]);
            } else {
                // Time window exceeded, save the last point of the group
                aggregated.push(currentGroup[currentGroup.length - 1]);
                currentGroup = [dataPoints[i]];
            }
        }
        
        // Don't forget the last group
        if (currentGroup.length > 0) {
            aggregated.push(currentGroup[currentGroup.length - 1]);
        }
        
        return aggregated;
    }

}

// Initialize the quest tracker when the page loads
let questTracker;
document.addEventListener('DOMContentLoaded', () => {
    questTracker = new QuestTracker();
});

// ============================================================================
// GLOBAL CHAT FUNCTIONALITY
// ============================================================================

let globalChatOpen = false;
let globalChatMessages = [];
let globalChatPinnedMessage = null;
let lastGlobalChatId = null;
let oldestChatTimestamp = null;
let globalChatPollInterval = null;
let globalChatInitialized = false;
let isSendingMessage = false;
let isLoadingMore = false;
let hasMoreMessages = true;

// 7TV Emotes (fetched from API)
let emotes = [];

// Fetch emotes from 7TV on init
async function load7TVEmotes() {
    try {
        const response = await fetch('/api/7tv-emotes');
        if (response.ok) {
            const data = await response.json();
            emotes = data.emotes || [];
            console.log(`Loaded ${emotes.length} emotes from 7TV`);
        }
    } catch (error) {
        console.error('Error loading 7TV emotes:', error);
    }
}

// Helper function to replace emote text with images
function replaceEmotes(text) {
    let result = escapeHtml(text);
    
    if (emotes.length === 0) return result;
    
    // Check if message contains only repeated instances of the same emote
    const trimmedText = text.trim();
    const words = trimmedText.split(/\s+/);
    
    // Check if all words are the same emote
    if (words.length > 0 && words.length <= 3) {
        const firstWord = words[0];
        const isEmote = emotes.some(e => e.name === firstWord);
        const allSame = words.every(w => w === firstWord);
        
        if (isEmote && allSame) {
            // User typed the same emote multiple times - size it based on count
            const emote = emotes.find(e => e.name === firstWord);
            let emoteSize = '28px';
            let emoteUrl = emote.url1x;
            
            if (words.length === 1) {
                emoteSize = '56px'; // 1x = medium, use 2x resolution
                emoteUrl = emote.url2x || emote.url1x;
            } else if (words.length === 2) {
                emoteSize = '84px'; // 2x = big, use 3x resolution
                emoteUrl = emote.url3x || emote.url2x || emote.url1x;
            } else if (words.length === 3) {
                emoteSize = '112px'; // 3x = BIGGEST, use 4x resolution
                emoteUrl = emote.url4x || emote.url3x || emote.url2x || emote.url1x;
            }
            
            return `<img src="${emoteUrl}" alt="${emote.name}" title="${emote.name}" style="height: ${emoteSize}; vertical-align: middle; display: inline-block; margin: 0 2px;">`;
        }
    }
    
    // Default: replace all emotes with normal size (use 1x resolution)
    emotes.forEach(emote => {
        const regex = new RegExp(`\\b${emote.name}\\b`, 'g');
        const emoteUrl = emote.url1x || emote.url;
        result = result.replace(regex, `<img src="${emoteUrl}" alt="${emote.name}" title="${emote.name}" style="height: 28px; vertical-align: middle; display: inline-block; margin: 0 2px;">`);
    });
    
    return result;
}

function initGlobalChat() {
    // Prevent double initialization
    if (globalChatInitialized) return;
    globalChatInitialized = true;

    const chatButton = document.getElementById('global-chat-button');
    const chatBox = document.getElementById('global-chat-box');
    const closeChatBtn = document.getElementById('close-chat-btn');
    const sendBtn = document.getElementById('global-chat-send-btn');
    const chatInput = document.getElementById('global-chat-input');
    const purgeChatBtn = document.getElementById('purge-chat-btn');

    if (!chatButton || !chatBox) {
        globalChatInitialized = false; // Reset if elements not found
        return;
    }

    // Show purge button for admins
    if (window.currentUser && window.currentUser.isAdmin && purgeChatBtn) {
        purgeChatBtn.style.display = 'block';
    }

    // Toggle chat box
    chatButton.addEventListener('click', async () => {
        globalChatOpen = !globalChatOpen;
        chatBox.style.display = globalChatOpen ? 'flex' : 'none';
        
        if (globalChatOpen) {
            await loadGlobalChat();
            // Hide unread badge when opening
            const badge = document.getElementById('chat-unread-badge');
            if (badge) badge.style.display = 'none';
            // Focus input
            if (chatInput) chatInput.focus();
            // Scroll to bottom
            setTimeout(() => {
                const messagesContainer = document.getElementById('global-chat-messages');
                if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            }, 100);
        }
    });

    // Close chat
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            globalChatOpen = false;
            chatBox.style.display = 'none';
        });
    }

    // Send message on button click
    if (sendBtn) {
        sendBtn.addEventListener('click', sendGlobalMessage);
    }

    // Send message on Enter (but Shift+Enter for new line)
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGlobalMessage();
            }
        });

        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }

    // Purge chat (admin only)
    if (purgeChatBtn) {
        purgeChatBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!confirm('Are you sure you want to purge all global chat messages? This cannot be undone.')) {
                return;
            }

            try {
                console.log('Attempting to purge global chat...');
                const response = await fetch('/api/global-chat/purge', {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                console.log('Purge response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Purge successful:', data);
                    globalChatMessages = [];
                    globalChatPinnedMessage = null;
                    lastGlobalChatId = null;
                    oldestChatTimestamp = null;
                    hasMoreMessages = false;
                    displayGlobalChatMessages();
                    alert(`Chat purged successfully! ${data.count} messages deleted.`);
                } else {
                    const errorData = await response.json();
                    console.error('Purge failed:', errorData);
                    alert('Failed to purge chat: ' + (errorData.details || errorData.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error purging chat:', error);
                alert('Error purging chat: ' + error.message);
            }
        });
    }
    
    // Load more button is now rendered dynamically in displayGlobalChatMessages()
    // and uses onclick handler directly in the HTML

    // Load 7TV emotes
    load7TVEmotes();
    
    // Initial load
    loadGlobalChat();
}

async function loadGlobalChat() {
    try {
        const url = lastGlobalChatId 
            ? `/api/global-chat?after=${lastGlobalChatId}&limit=50`
            : '/api/global-chat?limit=50';
        
        const response = await fetch(url, { credentials: 'include' });
        
        if (!response.ok) {
            console.error('Failed to load global chat');
            return;
        }
        
        const data = await response.json();
        const newMessages = data.messages || [];
        globalChatPinnedMessage = data.pinnedMessage || null;
        hasMoreMessages = data.hasMore || false;
        const totalCount = data.totalCount || 0;
        
        // Check if chat was purged (total count is 0 but we have messages locally)
        if (totalCount === 0 && globalChatMessages.length > 0) {
            console.log('Chat was purged, clearing local messages');
            globalChatMessages = [];
            lastGlobalChatId = null;
            oldestChatTimestamp = null;
            globalChatPinnedMessage = null;
            displayGlobalChatMessages();
            return;
        }
        
        // Check for deleted messages by validating our current messages still exist
        if (lastGlobalChatId && globalChatMessages.length > 0) {
            const serverMessageIds = new Set(data.allRecentIds || []);
            if (serverMessageIds.size > 0) {
                const beforeCount = globalChatMessages.length;
                globalChatMessages = globalChatMessages.filter(m => serverMessageIds.has(m.id));
                const afterCount = globalChatMessages.length;
                
                if (beforeCount !== afterCount) {
                    console.log(`Removed ${beforeCount - afterCount} deleted messages`);
                    displayGlobalChatMessages();
                }
            }
        }
        
        if (newMessages.length > 0) {
            if (lastGlobalChatId) {
                // Polling for new messages - prevent duplicates
                const existingIds = new Set(globalChatMessages.map(m => m.id));
                const uniqueNewMessages = newMessages.filter(m => !existingIds.has(m.id));
                
                if (uniqueNewMessages.length > 0) {
                    globalChatMessages.push(...uniqueNewMessages);
                    
                    // Show unread badge if chat is closed
                    if (!globalChatOpen) {
                        const badge = document.getElementById('chat-unread-badge');
                        if (badge) {
                            badge.textContent = uniqueNewMessages.length;
                            badge.style.display = 'flex';
                        }
                    }
                    
                    lastGlobalChatId = globalChatMessages[globalChatMessages.length - 1].id;
                    displayGlobalChatMessages();
                }
            } else {
                // Initial load
                globalChatMessages = newMessages;
                if (newMessages.length > 0) {
                    lastGlobalChatId = newMessages[newMessages.length - 1].id;
                    oldestChatTimestamp = newMessages[0].timestamp;
                }
                displayGlobalChatMessages();
            }
        }
    } catch (error) {
        console.error('Error loading global chat:', error);
    }
}

window.loadMoreMessages = async function() {
    console.log('loadMoreMessages called', { isLoadingMore, hasMoreMessages, oldestChatTimestamp });
    if (isLoadingMore || !hasMoreMessages || !oldestChatTimestamp) return;
    
    isLoadingMore = true;
    const messagesContainer = document.getElementById('global-chat-messages');
    const oldScrollHeight = messagesContainer.scrollHeight;
    
    // Re-render to show loading state
    displayGlobalChatMessages();
    
    try {
        const response = await fetch(`/api/global-chat?before=${oldestChatTimestamp}&limit=50`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            console.error('Failed to load more messages');
            return;
        }
        
        const data = await response.json();
        const olderMessages = data.messages || [];
        hasMoreMessages = data.hasMore || false;
        
        if (olderMessages.length > 0) {
            // Prepend older messages
            globalChatMessages = [...olderMessages, ...globalChatMessages];
            oldestChatTimestamp = olderMessages[0].timestamp;
            
            displayGlobalChatMessages();
            
            // Maintain scroll position
            setTimeout(() => {
                const newScrollHeight = messagesContainer.scrollHeight;
                messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;
            }, 50);
        }
    } catch (error) {
        console.error('Error loading more messages:', error);
    } finally {
        isLoadingMore = false;
        // Re-render to show normal state
        displayGlobalChatMessages();
    }
};

function displayGlobalChatMessages() {
    const messagesContainer = document.getElementById('global-chat-messages');
    const pinnedContainer = document.getElementById('global-chat-pinned-container');
    if (!messagesContainer) return;

    // Render pinned message in separate container
    if (pinnedContainer) {
        if (globalChatPinnedMessage) {
            pinnedContainer.innerHTML = renderPinnedMessage(globalChatPinnedMessage);
            pinnedContainer.style.display = 'block';
        } else {
            pinnedContainer.innerHTML = '';
            pinnedContainer.style.display = 'none';
        }
    }
    
    let html = '';

    // Add load more button at the top if there are more messages
    if (globalChatMessages.length > 0 && hasMoreMessages) {
        html += `
            <button id="load-more-chat-btn" class="load-more-chat-btn" onclick="loadMoreMessages()" ${isLoadingMore ? 'disabled' : ''}>
                <i class="fas fa-${isLoadingMore ? 'spinner fa-spin' : 'chevron-up'}"></i> ${isLoadingMore ? 'Loading...' : 'Load More Messages'}
            </button>
        `;
    }

    if (globalChatMessages.length === 0) {
        html += `
            <div style="text-align: center; color: var(--subtext); padding: 20px;">
                <i class="fas fa-comments" style="font-size: 2rem; opacity: 0.3; margin-bottom: 10px;"></i>
                <p>No messages yet. Start the conversation!</p>
            </div>
        `;
    } else {
        html += globalChatMessages.map(msg => renderMessage(msg)).join('');
    }

    const shouldScrollToBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 100;
    messagesContainer.innerHTML = html;

    if (shouldScrollToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function renderPinnedMessage(msg) {
    const timestamp = new Date(msg.timestamp);
    const timeString = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const displayName = msg.displayName || msg.username;
    const color = msg.profileColor || '#c7aa6a';
    const avatarUrl = msg.avatarUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName) + '&background=1a1a1a&color=c7aa6a';
    const isAdmin = window.currentUser && window.currentUser.isAdmin;
    
    return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(199, 170, 106, 0.1); border-bottom: 1px solid var(--post-border);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-thumbtack" style="color: #c7aa6a;"></i>
                <span style="color: #c7aa6a; font-size: 12px; font-weight: 600;">PINNED MESSAGE</span>
            </div>
            ${isAdmin ? `<button onclick="unpinMessage('${msg.id}')" class="pin-btn" title="Unpin"><i class="fas fa-times"></i></button>` : ''}
        </div>
        <div class="global-chat-message" style="background: rgba(199, 170, 106, 0.05); padding: 10px;">
            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}" class="global-chat-avatar" onerror="handleBrokenAvatar(this, '${escapeHtml(displayName)}')">
            <div class="global-chat-bubble">
                <div class="global-chat-header-info">
                    <span class="global-chat-name" style="color: ${color};">
                        ${escapeHtml(displayName)}
                        ${getUserBadges(msg)}
                    </span>
                    <span class="global-chat-time">${timeString}</span>
                </div>
                <div class="global-chat-text">${replaceEmotes(msg.message)}</div>
            </div>
        </div>
    `;
}

function renderMessage(msg) {
    const timestamp = new Date(msg.timestamp);
    const timeString = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const displayName = msg.displayName || msg.username;
    const color = msg.profileColor || '#c7aa6a';
    const avatarUrl = msg.avatarUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName) + '&background=1a1a1a&color=c7aa6a';
    const isAdmin = window.currentUser && window.currentUser.isAdmin;
    
    return `
        <div class="global-chat-message" data-message-id="${msg.id}">
            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}" class="global-chat-avatar" onerror="handleBrokenAvatar(this, '${escapeHtml(displayName)}')">
            <div class="global-chat-bubble">
                <div class="global-chat-header-info">
                    <span class="global-chat-name" style="color: ${color};">
                        ${escapeHtml(displayName)}
                        ${getUserBadges(msg)}
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="global-chat-time">${timeString}</span>
                        ${isAdmin ? `
                            <button onclick="pinMessage('${msg.id}')" class="pin-btn" title="Pin message">
                                <i class="fas fa-thumbtack"></i>
                            </button>
                            <button onclick="deleteMessage('${msg.id}')" class="delete-btn" title="Delete message">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="global-chat-text">${replaceEmotes(msg.message)}</div>
            </div>
        </div>
    `;
}

function getUserBadges(msg) {
    let badges = '';
    
    if (msg.isAdmin) {
        badges += '<i class="fas fa-shield-alt" style="color: #ffd700; font-size: 12px; margin-left: 4px;" title="Admin"></i>';
    }
    if (msg.verified) {
        badges += '<i class="fas fa-check-circle" style="color: #4CAF50; font-size: 12px; margin-left: 4px;" title="Verified"></i>';
    }
    
    return badges;
}

async function sendGlobalMessage() {
    // Prevent double sends
    if (isSendingMessage) return;
    
    const chatInput = document.getElementById('global-chat-input');
    const sendBtn = document.getElementById('global-chat-send-btn');
    
    if (!chatInput || !sendBtn) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Mark as sending and disable input while sending
    isSendingMessage = true;
    chatInput.disabled = true;
    sendBtn.disabled = true;
    
    try {
        const response = await fetch('/api/global-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message })
        });
        
        if (response.ok) {
            chatInput.value = '';
            chatInput.style.height = 'auto';
            // Reload messages immediately
            await loadGlobalChat();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message');
    } finally {
        isSendingMessage = false;
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

function startGlobalChatPolling() {
    if (globalChatPollInterval) return;
    
    globalChatPollInterval = setInterval(() => {
        loadGlobalChat();
    }, 3000); // Poll every 3 seconds
}

function stopGlobalChatPolling() {
    if (globalChatPollInterval) {
        clearInterval(globalChatPollInterval);
        globalChatPollInterval = null;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle broken avatar images globally
function handleBrokenAvatar(img, displayName) {
    // Generate a default avatar URL using UI Avatars
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=1a1a1a&color=c7aa6a&size=128`;
    
    // Only try once to prevent infinite loops
    if (img.src !== fallbackUrl) {
        img.src = fallbackUrl;
    } else {
        // If even the fallback fails, hide the image
        img.style.display = 'none';
    }
}

// Admin actions
async function pinMessage(messageId) {
    if (!window.currentUser || !window.currentUser.isAdmin) return;
    
    try {
        const response = await fetch(`/api/global-chat/${messageId}/pin`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            // Update pinned message with full user data
            const message = globalChatMessages.find(m => m.id === messageId);
            if (message) {
                globalChatPinnedMessage = message;
            } else {
                globalChatPinnedMessage = data.message;
            }
            displayGlobalChatMessages();
        } else {
            alert('Failed to pin message');
        }
    } catch (error) {
        console.error('Error pinning message:', error);
        alert('Error pinning message');
    }
}

async function unpinMessage(messageId) {
    if (!window.currentUser || !window.currentUser.isAdmin) return;
    
    try {
        const response = await fetch(`/api/global-chat/${messageId}/unpin`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            globalChatPinnedMessage = null;
            displayGlobalChatMessages();
        } else {
            alert('Failed to unpin message');
        }
    } catch (error) {
        console.error('Error unpinning message:', error);
        alert('Error unpinning message');
    }
}

async function deleteMessage(messageId) {
    if (!window.currentUser || !window.currentUser.isAdmin) return;
    
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        const response = await fetch(`/api/global-chat/${messageId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            // Remove message from local array
            globalChatMessages = globalChatMessages.filter(m => m.id !== messageId);
            
            // Also remove if it was the pinned message
            if (globalChatPinnedMessage && globalChatPinnedMessage.id === messageId) {
                globalChatPinnedMessage = null;
            }
            
            displayGlobalChatMessages();
        } else {
            alert('Failed to delete message');
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Error deleting message');
    }
}

// Initialize chat when user is logged in
if (window.currentUser) {
    // Check if DOM is already loaded (since script.js is loaded dynamically)
    if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', () => {
            initGlobalChat();
            startGlobalChatPolling();
        });
    } else {
        // DOM is already loaded, init immediately
        initGlobalChat();
        startGlobalChatPolling();
    }
}
