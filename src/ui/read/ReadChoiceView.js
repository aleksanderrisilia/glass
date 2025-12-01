import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class ReadChoiceView extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: white;
        }

        .read-choice-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            background: rgba(20, 20, 20, 0.8);
            border-radius: 12px;
            outline: 0.5px rgba(255, 255, 255, 0.2) solid;
            outline-offset: -1px;
            box-sizing: border-box;
            position: relative;
            padding: 8px;
            z-index: 1000;
        }

        .read-choice-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.15);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            filter: blur(10px);
            z-index: -1;
        }

        .read-choice-option {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s ease;
            position: relative;
            z-index: 1;
        }

        .read-choice-option:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .read-choice-option-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
        }

        .read-choice-option span {
            color: white;
            font-size: 13px;
            font-weight: 400;
        }
    `;

    constructor() {
        super();
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('mouseenter', this.handleMouseEnter);
        // Add click listener to detect clicks outside
        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutside, true);
        }, 100);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('mouseenter', this.handleMouseEnter);
        document.removeEventListener('click', this.handleClickOutside, true);
    }

    handleMouseEnter = () => {
        if (window.api && window.api.readChoiceView) {
            window.api.readChoiceView.cancelHideReadChoiceWindow();
        }
    }

    handleClickOutside = (e) => {
        const container = this.shadowRoot?.querySelector('.read-choice-container');
        // Check if click is outside the menu container
        // Also check if click is on any button in the header (Listen, Ask, Show/Hide, Settings)
        const isClickOnHeaderButton = e.target.closest('.listen-button') || 
                                      e.target.closest('.header-actions') || 
                                      e.target.closest('.settings-button') ||
                                      e.target.closest('.read-button-container');
        
        if (container && !container.contains(e.target) && !isClickOnHeaderButton) {
            // Click is outside the menu and not on header buttons - hide it
            if (window.api && window.api.readChoiceView) {
                window.api.readChoiceView.hideReadChoiceWindow();
            }
        } else if (isClickOnHeaderButton && !e.target.closest('.read-button-container')) {
            // Click is on another header button (not Read button) - hide the menu
            if (window.api && window.api.readChoiceView) {
                window.api.readChoiceView.hideReadChoiceWindow();
            }
        }
    }


    async _handleReadTab(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        // Hide window immediately when option is clicked
        if (window.api && window.api.readChoiceView) {
            window.api.readChoiceView.hideReadChoiceWindow();
        }
        if (window.api && window.api.mainHeader) {
            await window.api.mainHeader.sendReadButtonClick();
        }
    }

    async _handleReadPDF(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        // Hide window immediately when option is clicked
        if (window.api && window.api.readChoiceView) {
            window.api.readChoiceView.hideReadChoiceWindow();
        }
        if (window.api && window.api.mainHeader) {
            await window.api.mainHeader.sendReadPDFButtonClick();
        }
    }

    async _handleReadWord(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        // Hide window immediately when option is clicked
        if (window.api && window.api.readChoiceView) {
            window.api.readChoiceView.hideReadChoiceWindow();
        }
        if (window.api && window.api.mainHeader) {
            await window.api.mainHeader.sendReadWordButtonClick();
        }
    }

    render() {
        return html`
            <div class="read-choice-container" 
                 @mouseenter=${this.handleMouseEnter}
                 @click=${(e) => { e.stopPropagation(); }}>
                <div class="read-choice-option" 
                     @click=${this._handleReadTab}>
                    <div class="read-choice-option-icon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 2H14V14H2V2ZM3 3V13H13V3H3Z" fill="white"/>
                            <path d="M4 4H12V5H4V4ZM4 6H12V7H4V6ZM4 8H9V9H4V8Z" fill="white"/>
                        </svg>
                    </div>
                    <span>Read Chrome Tab</span>
                </div>
                <div class="read-choice-option" 
                     @click=${this._handleReadPDF}>
                    <div class="read-choice-option-icon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 2C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V5L9 1H4ZM4 3H8V6H12V13H4V3Z" fill="white"/>
                        </svg>
                    </div>
                    <span>Read PDF File</span>
                </div>
                <div class="read-choice-option" 
                     @click=${this._handleReadWord}>
                    <div class="read-choice-option-icon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 2C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V5L9 1H4ZM4 3H8V6H12V13H4V3Z" fill="white"/>
                        </svg>
                    </div>
                    <span>Read Word Document</span>
                </div>
            </div>
        `;
    }
}

customElements.define('read-choice-view', ReadChoiceView);

