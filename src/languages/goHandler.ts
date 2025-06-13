import { LanguageHandler, SupportedLanguage, LanguagePatterns, TypeContext, ParsedValue, LanguageSpecificConfig } from './languageHandler';

export class GoLanguageHandler implements LanguageHandler {
    readonly language: SupportedLanguage = 'go';
    readonly patterns: LanguagePatterns = {
        applicationPatterns: [
            'request', 'response', 'data', 'result', 'error', 'config',
            'handler', 'service', 'manager', 'client', 'server', 'user',
            'ctx', 'context', 'params', 'body', 'payload', 'message'
        ],
        systemPatterns: [
            '~', '.', '_internal', '_system', '_runtime', '_debug',
            'autotmp', 'goroutine', 'stack', 'heap', 'gc', 'sync',
            'mutex', 'lock', 'once', 'pool', 'buffer', 'cache'
        ],
        controlFlowPatterns: [
            'err', 'error', 'ok', 'found', 'valid', 'success', 'fail',
            'result', 'status', 'state', 'flag', 'enabled', 'disabled'
        ],
        primitiveTypes: [
            'string', 'int', 'int8', 'int16', 'int32', 'int64',
            'uint', 'uint8', 'uint16', 'uint32', 'uint64',
            'float32', 'float64', 'bool', 'byte', 'rune',
            'time.Time', 'time.Duration'
        ],
        complexTypes: [
            'struct', 'interface{}', 'map[', '[]', 'chan ', '*'
        ]
    };

    inferType(name: string, value: string, context: TypeContext): string {
        const keyLower = name.toLowerCase();
        
        // Go-specific type inference patterns
        if (keyLower.includes('time') || keyLower.includes('date') || keyLower.includes('timestamp')) {
            return 'time.Time';
        }
        if (keyLower.includes('id') && /^\d+$/.test(value)) return 'int64';
        if (keyLower.includes('count') || keyLower.includes('total')) return 'int';
        if (keyLower.includes('price') || keyLower.includes('amount')) return 'float64';
        if (keyLower.includes('flag') || keyLower.includes('enabled')) return 'bool';
        if (keyLower.includes('context') || keyLower === 'ctx') return 'context.Context';
        if (keyLower.includes('request') || keyLower === 'req') return 'http.Request';
        if (keyLower.includes('response') || keyLower === 'resp') return 'http.Response';
        
        // Value-based inference
        if (value.startsWith('*')) return '*struct';
        if (value.includes('{') && value.includes('}')) return 'struct';
        if (value.startsWith('[') && value.endsWith(']')) return 'slice';
        if (value.includes('0x')) return 'pointer';
        if (value.startsWith('map[')) return 'map';
        
        return context.parentType || 'interface{}';
    }

    parseVariableValue(value: string, type: string): ParsedValue {
        const isNil = this.isNilValue(value);
        const isPointer = type.startsWith('*') || value.includes('0x');
        let memoryAddress: string | undefined;
        
        // Extract memory address for pointers
        if (isPointer) {
            const addressMatch = value.match(/0x[a-fA-F0-9]+/);
            memoryAddress = addressMatch ? addressMatch[0] : undefined;
        }
        
        // Parse array length
        let arrayLength: number | undefined;
        if (type.includes('[]') || value.includes('len:')) {
            const lengthMatch = value.match(/len:\s*(\d+)/);
            arrayLength = lengthMatch ? parseInt(lengthMatch[1]) : undefined;
        }
        
        // Parse object key count
        let objectKeyCount: number | undefined;
        if (value.includes('{') && value.includes('}')) {
            const fields = this.parseStructFields(value);
            objectKeyCount = Object.keys(fields).length;
        }
        
        return {
            displayValue: this.formatDisplayValue(value, type),
            actualValue: value,
            isExpandable: this.isExpandable(value, type),
            isNil,
            isPointer,
            memoryAddress,
            arrayLength,
            objectKeyCount
        };
    }

    extractFunctionName(rawName: string): string {
        if (!rawName) return 'unknown';
        
        let cleaned = rawName.trim();
        
        // Remove package paths but keep meaningful parts
        if (cleaned.includes('/')) {
            const parts = cleaned.split('/');
            cleaned = parts[parts.length - 1];
        }
        
        // Keep function names readable
        if (cleaned.length > 50) {
            const parts = cleaned.split('.');
            if (parts.length > 1) {
                cleaned = parts.slice(-2).join('.');
            } else {
                cleaned = cleaned.substring(0, 47) + '...';
            }
        }
        
        return cleaned;
    }

    isSystemVariable(name: string, value: string): boolean {
        return this.patterns.systemPatterns.some(pattern => 
            name.startsWith(pattern) || name.includes(pattern));
    }

    isApplicationRelevant(name: string, value: string): boolean {
        if (this.isSystemVariable(name, value)) return false;
        
        const nameLower = name.toLowerCase();
        const hasApplicationKeyword = this.patterns.applicationPatterns.some(keyword => 
            nameLower.includes(keyword) || keyword.includes(nameLower));
        
        const hasMeaningfulValue = value && 
            !value.includes('0x') && 
            value !== 'nil' && 
            value.length > 1;
        
        return hasApplicationKeyword || hasMeaningfulValue;
    }

    isControlFlowVariable(name: string): boolean {
        const nameLower = name.toLowerCase();
        return this.patterns.controlFlowPatterns.some(pattern => 
            nameLower.includes(pattern));
    }

    isPrimitiveType(typeName: string): boolean {
        return this.patterns.primitiveTypes.some(p => typeName.includes(p));
    }

    isCollectionType(value: string, typeName: string): boolean {
        return (
            typeName.includes('[]') || 
            typeName.includes('map[') ||
            typeName.includes('slice') ||
            value.includes('len:') ||
            /\[.*\]/.test(value) ||
            (value.startsWith('[') && value.endsWith(']'))
        );
    }

    isStructuredType(value: string, typeName: string): boolean {
        return (
            (value.includes('{') && value.includes('}')) ||
            typeName.includes('struct') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(value, typeName))
        );
    }

    parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        let content = rawValue.trim();
        if (content.startsWith('{') && content.endsWith('}')) {
            content = content.slice(1, -1);
        }

        let bracketDepth = 0;
        let currentField = '';
        let currentValue = '';
        let inField = true;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            
            if (char === '{' || char === '[') bracketDepth++;
            else if (char === '}' || char === ']') bracketDepth--;

            if (char === ':' && bracketDepth === 0 && inField) {
                inField = false;
                i++;
                continue;
            }

            if (char === ',' && bracketDepth === 0) {
                if (currentField.trim() && currentValue.trim()) {
                    fields[currentField.trim()] = currentValue.trim();
                }
                currentField = '';
                currentValue = '';
                inField = true;
                i++;
                continue;
            }

            if (inField) currentField += char;
            else currentValue += char;
            
            i++;
        }

        if (currentField.trim() && currentValue.trim()) {
            fields[currentField.trim()] = currentValue.trim();
        }

        return fields;
    }

    parseArrayElements(rawValue: string): string[] {
        let content = rawValue;
        content = content.replace(/len:\s*\d+,?\s*/g, '');
        content = content.replace(/cap:\s*\d+,?\s*/g, '');
        
        const arrayMatch = content.match(/\[(.*)\]/s);
        if (!arrayMatch) return [];
        
        const elements = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        
        for (const char of arrayMatch[1]) {
            if (char === '"' && !inQuotes) inQuotes = true;
            else if (char === '"' && inQuotes) inQuotes = false;
            else if (!inQuotes) {
                if (char === '{' || char === '[') depth++;
                else if (char === '}' || char === ']') depth--;
                else if (char === ',' && depth === 0) {
                    if (current.trim()) elements.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        
        if (current.trim()) elements.push(current.trim());
        return elements;
    }

    isNilValue(rawValue: string): boolean {
        const nilPatterns = ['nil', 'null', '<nil>', 'undefined'];
        return nilPatterns.some(pattern => rawValue.trim() === pattern);
    }

    formatDisplayValue(value: string, type: string): string {
        if (this.isNilValue(value)) return 'nil';
        
        // Clean up string quotes
        if (type === 'string' && value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        return value;
    }

    calculateVariableImportance(name: string, value: string): number {
        let score = 0;
        const nameLower = name.toLowerCase();
        
        // High importance patterns
        if (this.patterns.applicationPatterns.some(p => nameLower.includes(p))) score += 100;
        if (this.patterns.controlFlowPatterns.some(p => nameLower.includes(p))) score += 75;
        
        // Low importance patterns (negative score)
        if (this.patterns.systemPatterns.some(p => nameLower.includes(p))) score -= 50;
        
        // Value-based scoring
        if (value && value !== 'nil' && value !== '<nil>' && value !== '0') score += 25;
        if (value.includes('{') || value.includes('[')) score += 10;
        
        // Penalty for very long names (often generated)
        if (name.length > 20) score -= 10;
        if (name.includes('autotmp') || name.includes('~r') || name.startsWith('.')) score -= 100;
        
        return score;
    }

    getDefaultConfig(): LanguageSpecificConfig {
        return {
            maxVariableDepth: 6,
            maxVariableValueLength: 1000,
            maxParameterCount: 30,
            enableTypeInference: true,
            enableDeepExpansion: true,
            memoryLimitMB: 50
        };
    }

    private isExpandable(value: string, type: string): boolean {
        return (
            value.includes('{') ||
            value.includes('[') ||
            value.includes('*{') ||
            type.includes('struct') ||
            type.includes('map[') ||
            type.includes('[]') ||
            (value.includes('0x') && type.startsWith('*'))
        );
    }
}