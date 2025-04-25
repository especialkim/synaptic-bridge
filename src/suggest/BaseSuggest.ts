export interface BaseSuggestProps {
    inputEl: HTMLInputElement;
    plugin: any;
}

export abstract class BaseSuggest<T> {
    protected suggestEl: HTMLElement;
    protected selectedIndex = -1;

    constructor(protected props: BaseSuggestProps) {
        this.suggestEl = createDiv('suggestion-container');
        this.initializeEventListeners();
        
        if (!document.body.contains(this.suggestEl)) {
            document.body.appendChild(this.suggestEl);
        }
    }

    protected initializeEventListeners(): void {
        const { inputEl } = this.props;
        
        inputEl.addEventListener('input', this.onInputChanged.bind(this));
        inputEl.addEventListener('focus', () => this.onInputChanged());
        inputEl.addEventListener('blur', () => {
            setTimeout(() => {
                this.suggestEl.style.display = 'none';
            }, 100);
        });
        inputEl.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    // 공통 키보드 이벤트 처리
    protected handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                this.moveSelection('up');
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.moveSelection('down');
                break;
            case 'Enter':
                event.preventDefault();
                this.selectCurrentSuggestion();
                this.suggestEl.style.display = 'none';
                break;
            case 'Escape':
                event.preventDefault();
                this.suggestEl.style.display = 'none';
                this.selectedIndex = -1;
                break;
        }
    }

    // 공통 선택 이동 로직
    protected moveSelection(direction: 'up' | 'down'): void {
        const suggestions = this.suggestEl.querySelectorAll('.suggestion-item');
        if (!suggestions.length) return;

        if (this.selectedIndex >= 0) {
            suggestions[this.selectedIndex].removeClass('is-selected');
        }

        if (direction === 'up') {
            this.selectedIndex = this.selectedIndex <= 0 ? suggestions.length - 1 : this.selectedIndex - 1;
        } else {
            this.selectedIndex = this.selectedIndex >= suggestions.length - 1 ? 0 : this.selectedIndex + 1;
        }

        const selectedEl = suggestions[this.selectedIndex];
        selectedEl.addClass('is-selected');
        selectedEl.scrollIntoView({ block: 'nearest' });
    }

    // 추상 메서드들
    protected abstract getItems(): T[];
    protected abstract calculateScore(item: T, inputStr: string): number;
    protected abstract getDisplayText(item: T): string;
    
    // 공통 입력 변경 처리
    protected onInputChanged(): void {
        const inputStr = this.props.inputEl.value.toLowerCase();
        if (!inputStr) {
            this.suggestEl.style.display = 'none';
            return;
        }

        const items = this.getItems();
        const matches = this.findMatches(items, inputStr);
        this.updateSuggestions(matches);
    }

    protected findMatches(items: T[], inputStr: string): T[] {
        return items
            .map(item => ({
                item,
                score: this.calculateScore(item, inputStr)
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ item }) => item);
    }

    protected selectCurrentSuggestion(): void {
        const suggestions = this.suggestEl.querySelectorAll('.suggestion-item');
        if (this.selectedIndex >= 0 && this.selectedIndex < suggestions.length) {
            const selectedValue = suggestions[this.selectedIndex].textContent;
            if (selectedValue) {
                this.props.inputEl.value = selectedValue;
                this.suggestEl.style.display = 'none';
                this.selectedIndex = -1;
                const evt = new Event('input', { bubbles: true });
                this.props.inputEl.dispatchEvent(evt);
            }
        }
    }

    protected updateSuggestions(matches: T[]): void {
        this.suggestEl.empty();
        
        if (matches.length > 0) {
            matches.forEach((match, index) => {
                const suggestionEl = this.suggestEl.createEl('div', {
                    text: this.getDisplayText(match),
                    cls: 'suggestion-item',
                });
                
                if (index === this.selectedIndex) {
                    suggestionEl.addClass('is-selected');
                }
                
                suggestionEl.addEventListener('click', () => {
                    this.props.inputEl.value = this.getDisplayText(match);
                    this.suggestEl.style.display = 'none';
                    this.selectedIndex = -1;
                    const evt = new Event('input', { bubbles: true });
                    this.props.inputEl.dispatchEvent(evt);
                });
            });
            
            const rect = this.props.inputEl.getBoundingClientRect();
            this.suggestEl.style.top = `${rect.bottom}px`;
            this.suggestEl.style.left = `${rect.left}px`;
            this.suggestEl.style.width = `${rect.width}px`;
            this.suggestEl.style.display = 'block';
        } else {
            this.suggestEl.style.display = 'none';
            this.selectedIndex = -1;
        }
    }

    protected calculateConsecutiveMatches(text: string, inputStr: string): number {
        const searchChars = inputStr.split('');
        let currentIndex = 0;
        let consecutiveMatches = 0;

        for (const char of searchChars) {
            if (char === ' ') {
                consecutiveMatches++;
                continue;
            }
            currentIndex = text.indexOf(char, currentIndex);
            if (currentIndex === -1) return 0;
            consecutiveMatches++;
            currentIndex += 1;
        }

        return consecutiveMatches;
    }
}