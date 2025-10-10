class QuestTracker {
    constructor() {
        this.quests = [];
        this.userProgress = { pmcLevel: 1, completedQuests: [] };
        this.currentMap = 'Any Location';
        this.maps = [];
        this.viewMode = 'available'; // 'available' or 'finished'
        this.showFutureQuests = false; // Show all future quests mode
        this.init();
    }

    async init() {
        await this.loadProgress();
        await this.loadQuests();
        this.setupEventListeners();
        this.updateUI();
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
            this.userProgress.completedQuests = JSON.parse(this.userProgress.completedQuests || '[]');
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

        const dashboardTab = document.getElementById('dashboard-tab');
        const finishedQuestsTab = document.getElementById('finished-quests-tab');
        
        dashboardTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToDashboard();
        });
        
        finishedQuestsTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToFinishedQuests();
        });

        const futureQuestsToggle = document.getElementById('show-future-quests');
        futureQuestsToggle.addEventListener('change', (e) => {
            this.showFutureQuests = e.target.checked;
            this.updateUI();
        });

        // Reset progress button
        const resetBtn = document.getElementById('reset-progress-btn');
        resetBtn.addEventListener('click', () => {
            this.showResetDialog();
        });

        // Collector progress button
        const collectorBtn = document.getElementById('collector-progress-btn');
        collectorBtn.addEventListener('click', () => {
            this.openCollectorProgress();
        });

        // Kappa overview button
        const kappaOverviewBtn = document.getElementById('kappa-overview-btn');
        kappaOverviewBtn.addEventListener('click', () => {
            this.openKappaOverview();
        });

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

        // Complete quest dialog buttons
        const cancelCompleteBtn = document.getElementById('cancel-complete');
        const confirmCompleteBtn = document.getElementById('confirm-complete');
        
        cancelCompleteBtn.addEventListener('click', () => {
            this.hideCompleteQuestDialog();
        });
        
        confirmCompleteBtn.addEventListener('click', () => {
            this.confirmCompleteQuest();
        });

        // Close complete quest dialog when clicking outside
        const completeDialogOverlay = document.getElementById('complete-quest-dialog');
        completeDialogOverlay.addEventListener('click', (e) => {
            if (e.target === completeDialogOverlay) {
                this.hideCompleteQuestDialog();
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

    async completeQuest(questId) {
        if (!this.userProgress.completedQuests.includes(questId)) {
            // Store questId for later confirmation
            this.pendingCompleteQuestId = questId;
            
            // Get quest name for display
            const quest = this.quests.find(q => q.id === questId);
            const questName = quest ? quest.name : 'Unknown Quest';
            
            // Show confirmation dialog
            this.showCompleteQuestDialog(questName);
        }
    }

    async confirmCompleteQuest() {
        const questId = this.pendingCompleteQuestId;
        if (!questId) return;
        
        // Add visual feedback
        const questCard = document.querySelector(`[data-quest-id="${questId}"]`);
        if (questCard) {
            questCard.style.opacity = '0.6';
            questCard.style.pointerEvents = 'none';
        }
        
        this.userProgress.completedQuests.push(questId);
        await this.saveProgress();
        this.updateUI();
        
        this.hideCompleteQuestDialog();
        this.pendingCompleteQuestId = null;
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
        }
    }

    handleWikiClick(questId) {
        // Find the quest by ID
        const quest = this.quests.find(q => q.id === questId);
        if (quest && quest.name.startsWith('Gunsmith')) {
            // For Gunsmith quests, modify the wiki link to include #Builds
            const wikiLink = quest.wikiLink;
            if (wikiLink && !wikiLink.includes('#Builds')) {
                // Add #Builds to the wiki link
                const modifiedLink = wikiLink + '#Builds';
                // Update the href attribute
                event.target.href = modifiedLink;
            }
        }
    }

    toggleViewMode() {
        this.viewMode = this.viewMode === 'available' ? 'finished' : 'available';
        this.updateNavigationState();
        this.updateUI();
    }

    switchToDashboard() {
        this.viewMode = 'available';
        this.updateNavigationState();
        this.updateUI();
    }

    switchToFinishedQuests() {
        this.viewMode = 'finished';
        this.updateNavigationState();
        this.updateUI();
    }

    updateNavigationState() {
        const dashboardTab = document.getElementById('dashboard-tab');
        const finishedQuestsTab = document.getElementById('finished-quests-tab');
        
        if (dashboardTab && finishedQuestsTab) {
            if (this.viewMode === 'available') {
                dashboardTab.classList.add('active');
                finishedQuestsTab.classList.remove('active');
            } else {
                dashboardTab.classList.remove('active');
                finishedQuestsTab.classList.add('active');
            }
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
                buttonHtml = `<button class="complete-btn uncomplete-btn" onclick="questTracker.uncompleteQuest('${quest.id}')">
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
                buttonHtml = `<button class="complete-btn" onclick="questTracker.completeQuest('${quest.id}')">
                                 COMPLETE QUEST
                               </button>`;
            } else {
                buttonHtml = `<button class="complete-btn" onclick="questTracker.completeQuest('${quest.id}')">
                                 COMPLETE QUEST
                               </button>`;
            }

            // Quest cards use neutral colors, buttons have the color coding
            let questCardClass = '';
            if (this.viewMode === 'finished') {
                questCardClass = 'completed-quest';
            }

            return `
                <div class="quest-card ${questCardClass}" data-quest-id="${quest.id}">
                    <div class="quest-header">
                        <div class="quest-name">${quest.name}</div>
                        <div class="quest-actions">
                            ${quest.wikiLink ? `<a href="${quest.wikiLink}" target="_blank" class="wiki-link" title="Open Wiki" onclick="questTracker.handleWikiClick('${quest.id}')">Wiki</a>` : ''}
                            <div class="quest-level-req">L${quest.level}</div>
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
                <button class="map-tab ${isActive}" onclick="questTracker.switchMap('${mapName}')">
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
                    if (item.type === 'markers') counts.markers += item.count;
                    if (item.type === 'jammers') counts.jammers += item.count;
                    if (item.type === 'cameras') counts.cameras += item.count;
                    if (item.type === 'key') counts.keys += 1; // Keys are counted as 1 each
                    if (item.category === 'fir') counts.fir += item.count;
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
        
        const objectivesList = objectives.map(obj => 
            `<li>${obj}</li>`
        ).join('');
        
        const uniqueId = `objectives-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="quest-objectives">
                <div class="quest-objectives-header" onclick="questTracker.toggleObjectives('${uniqueId}')">
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
        
        // Separate items by type
        const keys = items.filter(item => item.type === 'key');
        const markers = items.filter(item => item.type === 'markers');
        const jammers = items.filter(item => item.type === 'jammers');
        const cameras = items.filter(item => item.type === 'cameras');
        
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
                completedQuests: []
            };

            // Update UI
            document.getElementById('pmc-level').value = 1;
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

    openCollectorProgress() {
        // Open collector progress in a new window
        const collectorWindow = window.open(
            'collector-progress.html',
            'collectorProgress',
            'width=600,height=500,scrollbars=no,resizable=yes,menubar=no,toolbar=no,location=no,status=no'
        );

        // Store reference for updates
        window.collectorWindow = collectorWindow;

        // Send initial data to the new window
        if (collectorWindow) {
            collectorWindow.addEventListener('load', () => {
                collectorWindow.postMessage({
                    type: 'progressUpdate',
                    quests: this.quests,
                    userProgress: this.userProgress
                }, '*');
            });
        }
    }

    openKappaOverview() {
        // Open kappa overview in a new tab
        window.open('kappa-overview.html', '_blank');
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
}

// Initialize the quest tracker when the page loads
let questTracker;
document.addEventListener('DOMContentLoaded', () => {
    questTracker = new QuestTracker();
});
