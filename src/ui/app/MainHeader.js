import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class MainHeader extends LitElement {
    static properties = {
        isTogglingSession: { type: Boolean, state: true },
        isReading: { type: Boolean, state: true },
        readProgress: { type: Object, state: true },
        shortcuts: { type: Object, state: true },
        listenSessionStatus: { type: String, state: true },
    };

    static styles = css`
        :host {
            display: flex;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.sliding-in) {
            animation: fadeIn 0.2s ease-out forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }


        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        .header {
            -webkit-app-region: drag;
            width: max-content;
            min-width: fit-content;
            height: 47px;
            padding: 2px 15px 2px 13px; /* Increased right padding to ensure settings button isn't cut off */
            background: transparent;
            overflow: visible;
            border-radius: 9000px;
            /* backdrop-filter: blur(1px); */
            justify-content: flex-start; /* Changed from space-between to flex-start for better control */
            align-items: center;
            display: inline-flex;
            box-sizing: border-box;
            position: relative;
            flex-wrap: nowrap;
            gap: 0; /* No gap between items */
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 1);
            border-radius: 9000px;
            z-index: -1;
        }

        .header::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 9000px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%); 
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .listen-button {
            -webkit-app-region: no-drag;
            height: 26px;
            padding: 0 13px;
            background: transparent;
            border-radius: 9000px;
            justify-content: center;
            width: 78px;
            align-items: center;
            gap: 6px;
            display: flex;
            border: none;
            cursor: pointer;
            position: relative;
        }

        .listen-button:disabled {
            cursor: default;
            opacity: 0.8;
        }

        .listen-button.active::before {
            background: rgba(215, 0, 0, 0.5);
        }

        .listen-button.active:hover::before {
            background: rgba(255, 20, 20, 0.6);
        }

        .listen-button.done {
            background-color: rgba(255, 255, 255, 0.15);
            transition: background-color 0.15s ease;
        }

        .listen-button.done .action-text-content {
            color: white;
        }
        
        .listen-button.done .listen-icon svg rect,
        .listen-button.done .listen-icon svg path {
            fill: white;
        }

        .listen-button.done:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }

        .listen-button:hover::before {
            background: rgba(255, 255, 255, 0.1);
        }

        .listen-button::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 9000px;
            z-index: -1;
            transition: background 0.15s ease;
        }

        .listen-button::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 9000px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .listen-button.done::after {
            display: none;
        }

        .loading-dots {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .loading-dots span {
            width: 6px;
            height: 6px;
            background-color: white;
            border-radius: 50%;
            animation: pulse 1.4s infinite ease-in-out both;
        }
        .loading-dots span:nth-of-type(1) {
            animation-delay: -0.32s;
        }
        .loading-dots span:nth-of-type(2) {
            animation-delay: -0.16s;
        }
        @keyframes pulse {
            0%, 80%, 100% {
                opacity: 0.2;
            }
            40% {
                opacity: 1.0;
            }
        }

        .header-actions {
            -webkit-app-region: no-drag;
            height: 26px;
            box-sizing: border-box;
            justify-content: flex-start;
            align-items: center;
            gap: 9px;
            display: flex;
            padding: 0 8px;
            border-radius: 6px;
            transition: background 0.15s ease;
        }

        .header-actions:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        .read-button {
            -webkit-app-region: no-drag;
            height: 26px;
            padding: 0 13px;
            background: transparent;
            border-radius: 9000px;
            pointer-events: auto;
            justify-content: center;
            width: 78px;
            align-items: center;
            gap: 6px;
            display: flex;
            border: none;
            cursor: pointer;
            position: relative;
            margin-left: 4px;
        }

        .read-button:disabled {
            cursor: default;
            opacity: 0.5;
        }

        .read-button:hover::before {
            background: rgba(255, 255, 255, 0.1);
        }

        .read-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 9000px;
            background: transparent;
            transition: background 0.15s ease;
            z-index: -1;
        }

        .read-button.active::before {
            background: rgba(255, 255, 255, 0.12);
        }

        .read-icon svg {
            width: 12px;
            height: 12px;
            position: relative;
            top: 1px;
        }

        .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            width: 100%;
        }

        .read-progress {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
            min-width: 120px;
        }

        .progress-text {
            color: white;
            font-size: 10px;
            font-weight: 400;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .progress-bar {
            width: 100%;
            height: 3px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            overflow: hidden;
            position: relative;
        }

        .progress-fill {
            height: 100%;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 2px;
            transition: width 0.3s ease;
        }

        .ask-action {
            margin-left: 4px;
        }

        .action-button,
        .action-text {
            padding-bottom: 1px;
            justify-content: center;
            align-items: center;
            gap: 10px;
            display: flex;
        }

        .action-text-content {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500; /* Medium */
            word-wrap: break-word;
        }

        .icon-container {
            justify-content: flex-start;
            align-items: center;
            gap: 4px;
            display: flex;
        }

        .icon-container.ask-icons svg,
        .icon-container.showhide-icons svg {
            width: 12px;
            height: 12px;
        }

        .listen-icon svg {
            width: 12px;
            height: 11px;
            position: relative;
            top: 1px;
        }

        .icon-box {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 13%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .read-button-container {
            -webkit-app-region: no-drag;
        }

        .settings-button {
            -webkit-app-region: no-drag;
            padding: 5px;
            border-radius: 50%;
            background: transparent;
            transition: background 0.15s ease;
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .settings-button:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .settings-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3px;
        }

        .settings-icon svg {
            width: 16px;
            height: 16px;
        }
        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .header-actions,
        :host-context(body.has-glass) .settings-button {
            background: transparent !important;
            filter: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }
        :host-context(body.has-glass) .icon-box {
            background: transparent !important;
            border: none !important;
        }

        :host-context(body.has-glass) .header::before,
        :host-context(body.has-glass) .header::after,
        :host-context(body.has-glass) .listen-button::before,
        :host-context(body.has-glass) .listen-button::after {
            display: none !important;
        }

        :host-context(body.has-glass) .header-actions:hover,
        :host-context(body.has-glass) .settings-button:hover,
        :host-context(body.has-glass) .listen-button:hover::before {
            background: transparent !important;
        }
        :host-context(body.has-glass) * {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
        }

        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .header-actions,
        :host-context(body.has-glass) .settings-button,
        :host-context(body.has-glass) .icon-box {
            border-radius: 0 !important;
        }
        :host-context(body.has-glass) {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            will-change: auto !important;
        }
        `;

    constructor() {
        super();
        this.shortcuts = {};
        this.isVisible = true;
        this.isAnimating = false;
        this.hasSlidIn = false;
        this.settingsHideTimer = null;
        this.isTogglingSession = false;
        this.isReading = false;
        this.listenSessionStatus = 'beforeSession';
        this.animationEndTimer = null;
        this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.dragState = null;
        this.wasJustDragged = false;
    }

    _getListenButtonText(status) {
        switch (status) {
            case 'beforeSession': return 'Listen';
            case 'inSession'   : return 'Stop';
            case 'afterSession': return 'Done';
            default            : return 'Listen';
        }
    }

    async handleMouseDown(e) {
        e.preventDefault();

        const initialPosition = await window.api.mainHeader.getHeaderPosition();

        this.dragState = {
            initialMouseX: e.screenX,
            initialMouseY: e.screenY,
            initialWindowX: initialPosition.x,
            initialWindowY: initialPosition.y,
            moved: false,
        };

        window.addEventListener('mousemove', this.handleMouseMove, { capture: true });
        window.addEventListener('mouseup', this.handleMouseUp, { once: true, capture: true });
    }

    handleMouseMove(e) {
        if (!this.dragState) return;

        const deltaX = Math.abs(e.screenX - this.dragState.initialMouseX);
        const deltaY = Math.abs(e.screenY - this.dragState.initialMouseY);
        
        if (deltaX > 3 || deltaY > 3) {
            this.dragState.moved = true;
        }

        const newWindowX = this.dragState.initialWindowX + (e.screenX - this.dragState.initialMouseX);
        const newWindowY = this.dragState.initialWindowY + (e.screenY - this.dragState.initialMouseY);

        window.api.mainHeader.moveHeaderTo(newWindowX, newWindowY);
    }

    handleMouseUp(e) {
        if (!this.dragState) return;

        const wasDragged = this.dragState.moved;

        window.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
        this.dragState = null;

        if (wasDragged) {
            this.wasJustDragged = true;
            setTimeout(() => {
                this.wasJustDragged = false;
            }, 0);
        }
    }

    toggleVisibility() {
        if (this.isAnimating) {
            console.log('[MainHeader] Animation already in progress, ignoring toggle');
            return;
        }
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        this.isAnimating = true;
        
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    hide() {
        this.classList.remove('showing');
        this.classList.add('hiding');
    }
    
    show() {
        this.classList.remove('hiding', 'hidden');
        this.classList.add('showing');
    }
    
    handleAnimationEnd(e) {
        if (e.target !== this) return;
    
        this.isAnimating = false;
    
        if (this.classList.contains('hiding')) {
            this.classList.add('hidden');
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('hidden');
            }
        } else if (this.classList.contains('showing')) {
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('visible');
            }
        }
    }

    startSlideInAnimation() {
        if (this.hasSlidIn) return;
        this.classList.add('sliding-in');
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('animationend', this.handleAnimationEnd);

        if (window.api) {

            this._sessionStateTextListener = (event, { success }) => {
                if (success) {
                    this.listenSessionStatus = ({
                        beforeSession: 'inSession',
                        inSession: 'afterSession',
                        afterSession: 'beforeSession',
                    })[this.listenSessionStatus] || 'beforeSession';
                } else {
                    this.listenSessionStatus = 'beforeSession';
                }
                this.isTogglingSession = false; // ✨ 로딩 상태만 해제
            };
            window.api.mainHeader.onListenChangeSessionResult(this._sessionStateTextListener);

            this._shortcutListener = (event, keybinds) => {
                console.log('[MainHeader] Received updated shortcuts:', keybinds);
                this.shortcuts = keybinds;
            };
            window.api.mainHeader.onShortcutsUpdated(this._shortcutListener);

            // Set up read progress listener
            if (window.api.mainHeader.onReadProgress) {
                this._readProgressListener = (event, progressData) => {
                    this.readProgress = progressData;
                    this.requestUpdate();
                };
                window.api.mainHeader.onReadProgress(this._readProgressListener);
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('animationend', this.handleAnimationEnd);
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        if (window.api) {
            if (this._sessionStateTextListener) {
                window.api.mainHeader.removeOnListenChangeSessionResult(this._sessionStateTextListener);
            }
            if (this._shortcutListener) {
                window.api.mainHeader.removeOnShortcutsUpdated(this._shortcutListener);
            }
            if (this._readProgressListener && window.api.mainHeader.removeOnReadProgress) {
                window.api.mainHeader.removeOnReadProgress(this._readProgressListener);
            }
        }
    }

    showSettingsWindow(element) {
        if (this.wasJustDragged) return;
        // Close read-choice menu if open
        this.hideReadChoiceWindow();
        if (window.api) {
            console.log(`[MainHeader] showSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.showSettingsWindow();

        }
    }

    hideSettingsWindow() {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] hideSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.hideSettingsWindow();
        }
    }

    showReadChoiceWindow() {
        if (this.wasJustDragged || this.isReading) return;
        if (window.api) {
            console.log(`[MainHeader] showReadChoiceWindow called at ${Date.now()}`);
            window.api.mainHeader.showReadChoiceWindow();
        }
    }

    hideReadChoiceWindow() {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] hideReadChoiceWindow called at ${Date.now()}`);
            window.api.mainHeader.hideReadChoiceWindow();
        }
    }

    handleClickOutside(event) {
        // Check if click is outside the read-choice window
        const readChoiceWindow = document.querySelector('read-choice-view');
        if (readChoiceWindow && !readChoiceWindow.contains(event.target)) {
            // Check if click is also not on the Read button
            const readButton = event.target.closest('.read-button-container');
            if (!readButton) {
                this.hideReadChoiceWindow();
            }
        }
    }

    async _handleListenClick() {
        if (this.wasJustDragged) return;
        // Close read-choice menu if open
        this.hideReadChoiceWindow();
        if (this.isTogglingSession) {
            return;
        }

        this.isTogglingSession = true;

        try {
            const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
            if (window.api) {
                await window.api.mainHeader.sendListenButtonClick(listenButtonText);
            }
        } catch (error) {
            console.error('IPC invoke for session change failed:', error);
            this.isTogglingSession = false;
        }
    }



    async _handleReadTab() {
        this.isReading = true;
        this.requestUpdate();
        
        try {
            if (window.api) {
                const result = await window.api.mainHeader.sendReadButtonClick();
                if (result && result.success) {
                    console.log('[MainHeader] Read tab successful:', result.data);
                } else if (result && result.error) {
                    console.error('[MainHeader] Read tab failed:', result.error);
                    alert(`Failed to read tab: ${result.error}`);
                }
            }
        } catch (error) {
            console.error('IPC invoke for read tab failed:', error);
            alert(`Error: ${error.message}`);
        } finally {
            this.isReading = false;
            this.requestUpdate();
        }
    }

    async _handleReadPDF() {
        this.isReading = true;
        this.readProgress = null;
        this.requestUpdate();
        
        try {
            if (window.api) {
                const result = await window.api.mainHeader.sendReadPDFButtonClick();
                if (result && result.success) {
                    console.log('[MainHeader] Read PDF successful:', result.data);
                } else if (result && result.error) {
                    if (!result.canceled) {
                        console.error('[MainHeader] Read PDF failed:', result.error);
                        alert(`Failed to read PDF: ${result.error}`);
                    }
                }
            }
        } catch (error) {
            console.error('IPC invoke for read PDF failed:', error);
            alert(`Error: ${error.message}`);
        } finally {
            this.isReading = false;
            this.readProgress = null;
            this.requestUpdate();
        }
    }

    async _handleReadWord() {
        this.isReading = true;
        this.readProgress = null;
        this.requestUpdate();
        
        // Set up completion/error listener
        let contentHandler = null;
        
        if (window.api && window.api.mainHeader.onReadContentReceived) {
            contentHandler = (event, data) => {
                // Handle completion
                if (data.success) {
                    console.log('[MainHeader] Read Word document successful:', data);
                    this.isReading = false;
                    this.readProgress = null;
                    this.requestUpdate();
                    // Clean up listener
                    if (window.api && window.api.mainHeader.removeOnReadContentReceived) {
                        window.api.mainHeader.removeOnReadContentReceived(contentHandler);
                    }
                } 
                // Handle error or cancellation
                else if (!data.success) {
                    if (data.canceled) {
                        // User canceled file picker - clear loading immediately
                        this.isReading = false;
                        this.readProgress = null;
                        this.requestUpdate();
                    } else {
                        // Actual error
                        console.error('[MainHeader] Read Word document failed:', data.error);
                        alert(`Failed to read Word document: ${data.error}`);
                        this.isReading = false;
                        this.readProgress = null;
                        this.requestUpdate();
                    }
                    // Clean up listener
                    if (window.api && window.api.mainHeader.removeOnReadContentReceived) {
                        window.api.mainHeader.removeOnReadContentReceived(contentHandler);
                    }
                }
            };
            
            window.api.mainHeader.onReadContentReceived(contentHandler);
        }
        
        try {
            if (window.api) {
                const result = await window.api.mainHeader.sendReadWordButtonClick();
                // If file picker was canceled, clear loading state immediately
                if (result && result.canceled) {
                    this.isReading = false;
                    this.readProgress = null;
                    this.requestUpdate();
                    // Clean up listener
                    if (contentHandler && window.api && window.api.mainHeader.removeOnReadContentReceived) {
                        window.api.mainHeader.removeOnReadContentReceived(contentHandler);
                    }
                }
                // Otherwise, wait for completion/error events from readWord()
                // Loading state will be cleared by contentHandler when events arrive
            }
        } catch (error) {
            console.error('IPC invoke for read Word document failed:', error);
            alert(`Error: ${error.message}`);
            this.isReading = false;
            this.readProgress = null;
            this.requestUpdate();
            // Clean up listener
            if (contentHandler && window.api && window.api.mainHeader.removeOnReadContentReceived) {
                window.api.mainHeader.removeOnReadContentReceived(contentHandler);
            }
        }
    }



    async _handleAskClick() {
        if (this.wasJustDragged) return;
        // Close read-choice menu if open
        this.hideReadChoiceWindow();

        try {
            if (window.api) {
                await window.api.mainHeader.sendAskButtonClick();
            }
        } catch (error) {
            console.error('IPC invoke for ask button failed:', error);
        }
    }

    async _handleToggleAllWindowsVisibility() {
        if (this.wasJustDragged) return;
        // Close read-choice menu if open
        this.hideReadChoiceWindow();

        try {
            if (window.api) {
                await window.api.mainHeader.sendToggleAllWindowsVisibility();
            }
        } catch (error) {
            console.error('IPC invoke for all windows visibility button failed:', error);
        }
    }


    renderShortcut(accelerator) {
        if (!accelerator) return html``;

        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘',
            'Ctrl': '⌃', 'Control': '⌃',
            'Alt': '⌥', 'Option': '⌥',
            'Shift': '⇧',
            'Enter': '↵',
            'Backspace': '⌫',
            'Delete': '⌦',
            'Tab': '⇥',
            'Escape': '⎋',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→',
            '\\': html`<svg viewBox="0 0 6 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:6px; height:12px;"><path d="M1.5 1.3L5.1 10.6" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        };

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`
            <div class="icon-box">${keyMap[key] || key}</div>
        `)}`;
    }

    render() {
        const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
    
        const buttonClasses = {
            active: listenButtonText === 'Stop',
            done: listenButtonText === 'Done',
        };
        const showStopIcon = listenButtonText === 'Stop' || listenButtonText === 'Done';

        return html`
            <div class="header" @mousedown=${this.handleMouseDown}>
                <button 
                    class="listen-button ${Object.keys(buttonClasses).filter(k => buttonClasses[k]).join(' ')}"
                    @click=${this._handleListenClick}
                    ?disabled=${this.isTogglingSession}
                >
                    ${this.isTogglingSession
                        ? html`
                            <div class="loading-dots">
                                <span></span><span></span><span></span>
                            </div>
                        `
                        : html`
                            <div class="action-text">
                                <div class="action-text-content">${listenButtonText}</div>
                            </div>
                            <div class="listen-icon">
                                ${showStopIcon
                                    ? html`
                                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect width="9" height="9" rx="1" fill="white"/>
                                        </svg>
                                    `
                                    : html`
                                        <svg width="12" height="11" viewBox="0 0 12 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M1.69922 2.7515C1.69922 2.37153 2.00725 2.0635 2.38722 2.0635H2.73122C3.11119 2.0635 3.41922 2.37153 3.41922 2.7515V8.2555C3.41922 8.63547 3.11119 8.9435 2.73122 8.9435H2.38722C2.00725 8.9435 1.69922 8.63547 1.69922 8.2555V2.7515Z" fill="white"/>
                                            <path d="M5.13922 1.3755C5.13922 0.995528 5.44725 0.6875 5.82722 0.6875H6.17122C6.55119 0.6875 6.85922 0.995528 6.85922 1.3755V9.6315C6.85922 10.0115 6.55119 10.3195 6.17122 10.3195H5.82722C5.44725 10.3195 5.13922 10.0115 5.13922 9.6315V1.3755Z" fill="white"/>
                                            <path d="M8.57922 3.0955C8.57922 2.71553 8.88725 2.4075 9.26722 2.4075H9.61122C9.99119 2.4075 10.2992 2.71553 10.2992 3.0955V7.9115C10.2992 8.29147 9.99119 8.5995 9.61122 8.5995H9.26722C8.88725 8.5995 8.57922 8.29147 8.57922 7.9115V3.0955Z" fill="white"/>
                                        </svg>
                                    `}
                            </div>
                        `}
                </button>

                <div 
                    class="read-button-container"
                    style="-webkit-app-region: no-drag;"
                    @mouseenter=${(e) => this.showReadChoiceWindow(e.currentTarget)}
                >
                    <button 
                        class="read-button ${this.isReading ? 'active' : ''}"
                        ?disabled=${this.isReading}
                    >
                        ${this.isReading
                            ? html`
                                <div class="loading-container">
                                    <div class="loading-dots">
                                        <span></span><span></span><span></span>
                                    </div>
                                    ${this.readProgress 
                                        ? html`
                                            <div class="read-progress">
                                                <div class="progress-text">${this.readProgress.status || `Page ${this.readProgress.currentPage}/${this.readProgress.totalPages}`}</div>
                                                <div class="progress-bar">
                                                    <div class="progress-fill" style="width: ${this.readProgress.progress || 0}%"></div>
                                                </div>
                                            </div>
                                        `
                                        : html`
                                            <div class="progress-text">Processing document...</div>
                                        `
                                    }
                                </div>
                            `
                            : html`
                                <div class="action-text">
                                    <div class="action-text-content">Read</div>
                                </div>
                                <div class="read-icon">
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M6 1L2 5H5V11H7V5H10L6 1Z" fill="white"/>
                                    </svg>
                                </div>
                            `}
                    </button>
                    
                </div>

                <div class="header-actions ask-action" @click=${() => this._handleAskClick()}>
                    <div class="action-text">
                        <div class="action-text-content">Ask</div>
                    </div>
                    <div class="icon-container">
                        ${this.renderShortcut(this.shortcuts.nextStep)}
                    </div>
                </div>

                <div class="header-actions" @click=${() => this._handleToggleAllWindowsVisibility()}>
                    <div class="action-text">
                        <div class="action-text-content">Show/Hide</div>
                    </div>
                    <div class="icon-container">
                        ${this.renderShortcut(this.shortcuts.toggleVisibility)}
                    </div>
                </div>

                <button 
                    class="settings-button"
                    @mouseenter=${(e) => this.showSettingsWindow(e.currentTarget)}
                    @mouseleave=${() => this.hideSettingsWindow()}
                >
                    <div class="settings-icon">
                        <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8.0013 3.16406C7.82449 3.16406 7.65492 3.2343 7.5299 3.35932C7.40487 3.48435 7.33464 3.65392 7.33464 3.83073C7.33464 4.00754 7.40487 4.17711 7.5299 4.30213C7.65492 4.42716 7.82449 4.4974 8.0013 4.4974C8.17811 4.4974 8.34768 4.42716 8.47271 4.30213C8.59773 4.17711 8.66797 4.00754 8.66797 3.83073C8.66797 3.65392 8.59773 3.48435 8.47271 3.35932C8.34768 3.2343 8.17811 3.16406 8.0013 3.16406ZM8.0013 7.83073C7.82449 7.83073 7.65492 7.90097 7.5299 8.02599C7.40487 8.15102 7.33464 8.32058 7.33464 8.4974C7.33464 8.67421 7.40487 8.84378 7.5299 8.9688C7.65492 9.09382 7.82449 9.16406 8.0013 9.16406C8.17811 9.16406 8.34768 9.09382 8.47271 8.9688C8.59773 8.84378 8.66797 8.67421 8.66797 8.4974C8.66797 8.32058 8.59773 8.15102 8.47271 8.02599C8.34768 7.90097 8.17811 7.83073 8.0013 7.83073ZM8.0013 12.4974C7.82449 12.4974 7.65492 12.5676 7.5299 12.6927C7.40487 12.8177 7.33464 12.9873 7.33464 13.1641C7.33464 13.3409 7.40487 13.5104 7.5299 13.6355C7.65492 13.7605 7.82449 13.8307 8.0013 13.8307C8.17811 13.8307 8.34768 13.7605 8.47271 13.6355C8.59773 13.5104 8.66797 13.3409 8.66797 13.1641C8.66797 12.9873 8.59773 12.8177 8.47271 12.6927C8.34768 12.5676 8.17811 12.4974 8.0013 12.4974Z" fill="white" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                </button>
            </div>
        `;
    }
}

customElements.define('main-header', MainHeader);
