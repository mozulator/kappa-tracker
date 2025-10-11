class QuestTracker {
    constructor() {
        this.quests = [];
        this.userProgress = { pmcLevel: 1, prestige: 0, completedQuests: [] };
        this.currentMap = 'Any Location';
        this.maps = [];
        this.viewMode = 'available'; // 'available' or 'finished'
        this.currentView = 'dashboard'; // 'dashboard', 'finished', 'rankings', or 'profile'
        this.showFutureQuests = false; // Show all future quests mode
        this.isAdmin = false; // Will be set from auth check
        this.init();
    }

    async init() {
        // Check admin status first
        await this.checkAdminStatus();
        await this.loadProgress();
        await this.loadQuests();
        this.setupEventListeners();
        this.updateUI();
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
        try {
            await fetch('/api/progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.userProgress),
                credentials: 'include'
            });
        } catch (error) {
            console.error('Error saving progress:', error);
        }
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
        const rankingsTab = document.getElementById('rankings-tab');
        const profileTab = document.getElementById('profile-tab');
        
        dashboardTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToDashboard();
        });
        
        finishedQuestsTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToFinishedQuests();
        });

        rankingsTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToRankings();
        });

        profileTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToProfile();
        });

        const futureQuestsToggle = document.getElementById('show-future-quests');
        futureQuestsToggle.addEventListener('change', (e) => {
            this.showFutureQuests = e.target.checked;
            this.updateUI();
        });

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
        const questMap = quest.mapName || 'Any Location';
        return questMap === this.currentMap;
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
        this.showView('dashboard');
        this.updateNavigationState();
        this.updateUI();
    }

    switchToFinishedQuests() {
        this.viewMode = 'finished';
        this.currentView = 'finished';
        this.showView('finished');
        this.updateNavigationState();
        this.updateUI();
    }

    switchToRankings() {
        this.currentView = 'rankings';
        this.showView('rankings');
        this.updateNavigationState();
        this.loadRankings();
    }

    switchToProfile() {
        this.currentView = 'profile';
        this.showView('profile');
        this.updateNavigationState();
        this.loadProfile();
    }

    showView(view) {
        // Hide all sections
        const questsSection = document.getElementById('quests-section');
        const mapOverview = document.getElementById('map-overview');
        const mapTabsSection = document.querySelector('.map-tabs-section');
        const sidebar = document.querySelector('.sidebar');
        const rankingsSection = document.getElementById('rankings-section');
        const profileSection = document.getElementById('profile-section');
        const fixQuestsSection = document.getElementById('fix-quests-section');

        questsSection.style.display = 'none';
        mapOverview.style.display = 'none';
        mapTabsSection.style.display = 'none';
        sidebar.style.display = 'none';
        rankingsSection.style.display = 'none';
        profileSection.style.display = 'none';
        if (fixQuestsSection) fixQuestsSection.style.display = 'none';

        // Show relevant sections based on view
        if (view === 'dashboard' || view === 'finished') {
            questsSection.style.display = 'block';
            mapOverview.style.display = 'block';
            mapTabsSection.style.display = 'block';
            sidebar.style.display = 'flex'; // Use flex to maintain sidebar layout
        } else if (view === 'rankings') {
            rankingsSection.style.display = 'block';
        } else if (view === 'profile') {
            profileSection.style.display = 'block';
        }
    }

    updateNavigationState() {
        const dashboardTab = document.getElementById('dashboard-tab');
        const finishedQuestsTab = document.getElementById('finished-quests-tab');
        const rankingsTab = document.getElementById('rankings-tab');
        const profileTab = document.getElementById('profile-tab');
        const fixQuestsTab = document.getElementById('fix-quests-tab');
        
        // Remove active class from all tabs
        [dashboardTab, finishedQuestsTab, rankingsTab, profileTab, fixQuestsTab].forEach(tab => {
            if (tab) tab.classList.remove('active');
        });
        
        // Add active class to current view
        if (this.currentView === 'dashboard') {
            dashboardTab?.classList.add('active');
        } else if (this.currentView === 'finished') {
            finishedQuestsTab?.classList.add('active');
        } else if (this.currentView === 'rankings') {
            rankingsTab?.classList.add('active');
        } else if (this.currentView === 'profile') {
            profileTab?.classList.add('active');
        }
    }

    updateUI() {
        this.buildMapTabs();
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
        const questsGrid = document.getElementById('quests-grid');
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
            
            // Parse required items from server data
            const requiredItems = this.parseRequiredItems(quest.requiredItems);
            const itemsHtml = this.renderRequiredItems(requiredItems);
            
            // Find quests unlocked by completing this quest
            const unlocksHtml = this.renderUnlockedQuests(quest.id);

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
            
            return `
                <div class="quest-card ${questCardClass}" data-quest-id="${quest.id}">
                    <div class="quest-header">
                        <div class="quest-name">${quest.name}</div>
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
                    ${itemsHtml}
                    ${unlocksHtml}
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
    }

    buildMapTabs() {
        const mapTabsContainer = document.getElementById('map-tabs');
        if (!mapTabsContainer) return;

        mapTabsContainer.innerHTML = this.maps.map(mapName => {
            const questStats = this.getQuestStatsForMap(mapName);
            const isActive = (mapName === this.currentMap) ? 'active' : '';
            
            return `
                <button class="map-tab ${isActive}" onclick="window.tracker.switchMap('${mapName}')">
                    ${mapName} (<strong>${questStats.available}</strong>) ${questStats.completed}/${questStats.total}
                </button>
            `;
        }).join('');
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
        this.updateUI();
    }

    updateMapOverview() {
        const currentMapQuests = this.getQuestsForCurrentMap();
        
        // Get the appropriate quest list based on current mode
        let questsToCount;
        if (this.viewMode === 'finished') {
            questsToCount = this.getFinishedQuests();
        } else if (this.showFutureQuests) {
            questsToCount = this.getFutureQuests();
        } else {
            questsToCount = this.getAvailableQuests();
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
            
            // Build rankings table HTML
            container.innerHTML = `
                <div style="padding: 20px;">
                    <h2 style="color: #c7aa6a; font-size: 28px; margin-bottom: 20px;">
                        <i class="fas fa-trophy"></i> Global Rankings
                    </h2>
                    <div style="background: rgba(30, 30, 30, 0.8); border: 2px solid #3a3a3a; border-radius: 12px; overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: rgba(199, 170, 106, 0.1);">
                                    <th style="padding: 15px; text-align: left; color: #c7aa6a; font-weight: 600; border-bottom: 2px solid #3a3a3a;">Rank</th>
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
                                            <td style="padding: 15px;">
                                                <div style="display: flex; align-items: center; gap: 12px;">
                                                    ${user.avatarUrl ? `
                                                        <img src="${user.avatarUrl}" alt="${displayName}" 
                                                             style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #c7aa6a;" 
                                                             loading="lazy"
                                                             onerror="this.style.display='none'">
                                                    ` : ''}
                                                    <div>
                                                        <a href="/public-profile?user=${user.username}" style="color: #fff; font-weight: 600; font-size: 16px; text-decoration: none; cursor: pointer;">
                                                            ${displayName}
                                                        </a>
                                                        <div style="color: #888; font-size: 14px;">@${user.username}</div>
                                                        <div style="margin-top: 5px; display: flex; gap: 10px; flex-wrap: wrap;">
                                                            ${user.twitchUrl ? `
                                                                <a href="${user.twitchUrl}" target="_blank" style="color: #6441a5; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                                                                    <i class="fab fa-twitch"></i> Twitch
                                                                </a>
                                                            ` : ''}
                                                            ${user.tarkovDevId ? `
                                                                <a href="https://tarkov.dev/player/${user.tarkovDevId}" target="_blank" style="color: #c7aa6a; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                                                                    <i class="fas fa-gamepad"></i> Tarkov.dev
                                                                </a>
                                                            ` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style="padding: 15px; text-align: center; color: #fff; font-weight: 600; font-size: 16px;">${user.progress.pmcLevel}</td>
                                            <td style="padding: 15px; text-align: center;">
                                                ${user.progress.prestige && user.progress.prestige > 0 ? `
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
            `;
        } catch (error) {
            console.error('Error loading rankings:', error);
            container.innerHTML = '<div style="padding: 60px; text-align: center; color: #ef4444;">Failed to load rankings</div>';
        }
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
                <div style="padding: 20px;">
                    <h2 style="color: #c7aa6a; font-size: 28px; margin-bottom: 20px;">
                        <i class="fas fa-user"></i> My Profile
                    </h2>
                    
                    <div style="background: rgba(30, 30, 30, 0.8); border: 2px solid #3a3a3a; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
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
                        
                    </div>
                    
                    <div style="background: rgba(30, 30, 30, 0.8); border: 2px solid #3a3a3a; border-radius: 12px; padding: 30px;">
                        <h3 style="color: #c7aa6a; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #3a3a3a; padding-bottom: 10px;">Quest Progress</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                            <div style="background: rgba(199, 170, 106, 0.1); border: 2px solid #c7aa6a; border-radius: 8px; padding: 20px; text-align: center;">
                                <div style="color: #888; font-size: 14px; margin-bottom: 10px;">PMC Level</div>
                                <div style="color: #c7aa6a; font-size: 32px; font-weight: 700;">${this.userProgress.pmcLevel}</div>
                            </div>
                            <div style="background: rgba(76, 175, 80, 0.1); border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; text-align: center;">
                                <div style="color: #888; font-size: 14px; margin-bottom: 10px;">Quests Completed</div>
                                <div style="color: #4CAF50; font-size: 32px; font-weight: 700;">${this.userProgress.completedQuests.length}</div>
                            </div>
                            <div style="background: rgba(255, 152, 0, 0.1); border: 2px solid #FF9800; border-radius: 8px; padding: 20px; text-align: center;">
                                <div style="color: #888; font-size: 14px; margin-bottom: 10px;">Completion Rate</div>
                                <div style="color: #FF9800; font-size: 32px; font-weight: 700;">${this.userProgress.completionRate.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
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

// Initialize the quest tracker when the page loads
let questTracker;
document.addEventListener('DOMContentLoaded', () => {
    questTracker = new QuestTracker();
});
