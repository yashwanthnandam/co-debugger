export interface SimplificationOptions {
    maxDepth: number;
    maxArrayLength: number;
    maxStringLength: number;
    maxObjectKeys: number;
    showPointerAddresses: boolean;
    expandKnownTypes: string[];
    truncateThreshold: number;
    preserveBusinessFields: string[];
}

export interface SimplifiedValue {
    originalType: string;
    displayValue: string;
    isExpanded: boolean;
    hasMore: boolean;
    children?: Record<string, SimplifiedValue>;
    metadata: {
        isPointer: boolean;
        isNil: boolean;
        memoryAddress?: string;
        arrayLength?: number;
        objectKeyCount?: number;
        truncatedAt?: number;
    };
}

export class DataStructureHandler {
    private defaultOptions: SimplificationOptions = {
        maxDepth: 4,
        maxArrayLength: 10,
        maxStringLength: 200,
        maxObjectKeys: 15,
        showPointerAddresses: false,
        expandKnownTypes: [
            'string', 'int', 'int64', 'float64', 'bool', 'time.Time',
            // Business-agnostic common types
            'User', 'Request', 'Response', 'Context', 'Config', 'Error'
        ],
        truncateThreshold: 500,
        preserveBusinessFields: [
            // Common business fields across domains
            'id', 'name', 'email', 'status', 'type', 'value', 'data',
            'result', 'error', 'message', 'code', 'timestamp', 'created',
            'updated', 'user', 'request', 'response'
        ]
    };

    private circularRefs = new Set<string>();
    private processedAddresses = new Map<string, SimplifiedValue>();

    simplifyValue(
        rawValue: string, 
        typeName: string, 
        options: Partial<SimplificationOptions> = {}
    ): SimplifiedValue {
        const opts = { ...this.defaultOptions, ...options };
        this.circularRefs.clear();
        this.processedAddresses.clear();

        return this.processValue(rawValue, typeName, 0, opts);
    }

    private processValue(
        rawValue: string,
        typeName: string,
        depth: number,
        options: SimplificationOptions
    ): SimplifiedValue {
        // Early termination for max depth
        if (depth > options.maxDepth) {
            return this.createTruncatedValue(rawValue, typeName, 'Max depth reached');
        }

        // Handle nil/null values
        if (this.isNilValue(rawValue)) {
            return this.createSimpleValue(rawValue, typeName, { isNil: true });
        }

        // Handle pointers
        if (this.isPointerValue(rawValue, typeName)) {
            return this.processPointer(rawValue, typeName, depth, options);
        }

        // Handle primitive types
        if (this.isPrimitiveType(typeName)) {
            return this.processPrimitive(rawValue, typeName, options);
        }

        // Handle collections (arrays, slices, maps)
        if (this.isCollectionType(rawValue, typeName)) {
            return this.processCollection(rawValue, typeName, depth, options);
        }

        // Handle structured data (structs, JSON objects)
        if (this.isStructuredType(rawValue, typeName)) {
            return this.processStructuredData(rawValue, typeName, depth, options);
        }

        // Handle JSON strings
        if (this.isPossibleJSON(rawValue)) {
            return this.processJSONString(rawValue, typeName, depth, options);
        }

        // Default: treat as string with truncation
        return this.processPrimitive(rawValue, typeName, options);
    }

    private isPointerValue(rawValue: string, typeName: string): boolean {
        return typeName.startsWith('*') || rawValue.includes('0x') || rawValue.includes('*{');
    }

    private processPointer(
        rawValue: string,
        typeName: string,
        depth: number,
        options: SimplificationOptions
    ): SimplifiedValue {
        // Extract memory address
        const addressMatch = rawValue.match(/0x[0-9a-fA-F]+/);
        const memoryAddress = addressMatch ? addressMatch[0] : undefined;

        // Check for circular reference
        if (memoryAddress && this.circularRefs.has(memoryAddress)) {
            return this.createSimpleValue(`[Circular Reference to ${memoryAddress}]`, typeName, {
                isPointer: true,
                memoryAddress
            });
        }

        // Check if we've already processed this address
        if (memoryAddress && this.processedAddresses.has(memoryAddress)) {
            const cached = this.processedAddresses.get(memoryAddress)!;
            return {
                ...cached,
                displayValue: options.showPointerAddresses 
                    ? `[${memoryAddress}] → ${cached.displayValue}`
                    : cached.displayValue
            };
        }

        if (memoryAddress) {
            this.circularRefs.add(memoryAddress);
        }

        // Extract the actual value from pointer syntax
        const actualValue = this.extractPointerValue(rawValue);
        const actualType = typeName.startsWith('*') ? typeName.substring(1) : typeName;

        // Process the dereferenced value
        const result = this.processValue(actualValue, actualType, depth + 1, options);
        
        // Add pointer metadata
        result.metadata.isPointer = true;
        result.metadata.memoryAddress = memoryAddress;

        if (!options.showPointerAddresses && memoryAddress) {
            // Clean up display by removing address
            result.displayValue = result.displayValue.replace(/0x[0-9a-fA-F]+/g, '').trim();
        }

        if (memoryAddress) {
            this.processedAddresses.set(memoryAddress, result);
            this.circularRefs.delete(memoryAddress);
        }

        return result;
    }

    private extractPointerValue(rawValue: string): string {
        // Handle Go pointer syntax: *StructName {field1: value1, ...}
        const match = rawValue.match(/\*\w+\s*(\{.*\})/s);
        if (match) {
            return match[1];
        }

        // Handle simple pointer syntax
        const simpleMatch = rawValue.match(/\*\w+\s*(.+)/s);
        if (simpleMatch) {
            return simpleMatch[1];
        }

        return rawValue;
    }

    private isPrimitiveType(typeName: string): boolean {
        const primitives = [
            'string', 'int', 'int8', 'int16', 'int32', 'int64',
            'uint', 'uint8', 'uint16', 'uint32', 'uint64',
            'float32', 'float64', 'bool', 'byte', 'rune',
            'time.Time', 'time.Duration'
        ];
        return primitives.some(p => typeName.includes(p));
    }

    private processPrimitive(
        rawValue: string,
        typeName: string,
        options: SimplificationOptions
    ): SimplifiedValue {
        let displayValue = rawValue;

        // Handle strings with quotes
        if (typeName === 'string' && displayValue.startsWith('"') && displayValue.endsWith('"')) {
            displayValue = displayValue.slice(1, -1);
        }

        // Truncate long strings
        if (displayValue.length > options.maxStringLength) {
            return this.createTruncatedValue(
                displayValue.substring(0, options.maxStringLength),
                typeName,
                `String truncated (${displayValue.length} chars total)`
            );
        }

        return this.createSimpleValue(displayValue, typeName);
    }

    private isCollectionType(rawValue: string, typeName: string): boolean {
        return (
            typeName.includes('[]') || 
            typeName.includes('map[') ||
            typeName.includes('slice') ||
            rawValue.includes('len:') ||
            /\[.*\]/.test(rawValue) ||
            rawValue.startsWith('[') && rawValue.endsWith(']')
        );
    }

    private processCollection(
        rawValue: string,
        typeName: string,
        depth: number,
        options: SimplificationOptions
    ): SimplifiedValue {
        // Extract collection info
        const lengthMatch = rawValue.match(/len:\s*(\d+)/);
        const capacityMatch = rawValue.match(/cap:\s*(\d+)/);
        const arrayLength = lengthMatch ? parseInt(lengthMatch[1]) : undefined;

        // Handle empty collections
        if (arrayLength === 0 || rawValue === '[]' || rawValue === 'nil') {
            return this.createSimpleValue('[]', typeName, { arrayLength: 0 });
        }

        // Parse array elements
        const elements = this.parseArrayElements(rawValue);
        const truncatedElements = elements.slice(0, options.maxArrayLength);

        const children: Record<string, SimplifiedValue> = {};
        truncatedElements.forEach((element, index) => {
            const elementType = this.inferElementType(element, typeName);
            children[`[${index}]`] = this.processValue(element, elementType, depth + 1, options);
        });

        const hasMore = elements.length > options.maxArrayLength;
        const displayValue = hasMore 
            ? `Array[${elements.length}] (showing first ${options.maxArrayLength})`
            : `Array[${elements.length}]`;

        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore,
            children,
            metadata: {
                isPointer: false,
                isNil: false,
                arrayLength: elements.length
            }
        };
    }

    private isStructuredType(rawValue: string, typeName: string): boolean {
        return (
            rawValue.includes('{') && rawValue.includes('}') ||
            typeName.includes('struct') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(rawValue, typeName))
        );
    }

    private processStructuredData(
        rawValue: string,
        typeName: string,
        depth: number,
        options: SimplificationOptions
    ): SimplifiedValue {
        // Parse struct fields
        const fields = this.parseStructFields(rawValue);
        
        if (Object.keys(fields).length === 0) {
            return this.createSimpleValue('{}', typeName);
        }

        // Prioritize business-relevant fields
        const sortedFields = this.prioritizeFields(fields, options.preserveBusinessFields);
        const truncatedFields = Object.fromEntries(
            Object.entries(sortedFields).slice(0, options.maxObjectKeys)
        );

        const children: Record<string, SimplifiedValue> = {};
        Object.entries(truncatedFields).forEach(([key, value]) => {
            const fieldType = this.inferFieldType(key, value);
            children[key] = this.processValue(value, fieldType, depth + 1, options);
        });

        const hasMore = Object.keys(fields).length > options.maxObjectKeys;
        const displayValue = this.createStructSummary(typeName, Object.keys(truncatedFields), hasMore);

        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore,
            children,
            metadata: {
                isPointer: false,
                isNil: false,
                objectKeyCount: Object.keys(fields).length
            }
        };
    }

    private isPossibleJSON(rawValue: string): boolean {
        const trimmed = rawValue.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    private processJSONString(
        rawValue: string,
        typeName: string,
        depth: number,
        options: SimplificationOptions
    ): SimplifiedValue {
        try {
            const parsed = JSON.parse(rawValue);
            return this.processValue(
                JSON.stringify(parsed, null, 2),
                `JSON(${typeof parsed})`,
                depth,
                options
            );
        } catch {
            // Not valid JSON, treat as string
            return this.processPrimitive(rawValue, typeName, options);
        }
    }

    private parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        // Remove outer braces
        let content = rawValue.trim();
        if (content.startsWith('{') && content.endsWith('}')) {
            content = content.slice(1, -1);
        }

        // Parse field: value pairs with proper nesting handling
        let bracketDepth = 0;
        let currentField = '';
        let currentValue = '';
        let inField = true;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            
            if (char === '{' || char === '[') {
                bracketDepth++;
            } else if (char === '}' || char === ']') {
                bracketDepth--;
            }

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

            if (inField) {
                currentField += char;
            } else {
                currentValue += char;
            }
            
            i++;
        }

        // Add the last field
        if (currentField.trim() && currentValue.trim()) {
            fields[currentField.trim()] = currentValue.trim();
        }

        return fields;
    }

    private parseArrayElements(rawValue: string): string[] {
        // Handle Go slice/array syntax
        let content = rawValue;
        
        // Remove slice metadata (len:, cap:)
        content = content.replace(/len:\s*\d+,?\s*/g, '');
        content = content.replace(/cap:\s*\d+,?\s*/g, '');
        
        // Extract array content
        const arrayMatch = content.match(/\[(.*)\]/s);
        if (!arrayMatch) return [];
        
        const elements = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        
        for (const char of arrayMatch[1]) {
            if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === '"' && inQuotes) {
                inQuotes = false;
            } else if (!inQuotes) {
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

    private prioritizeFields(
        fields: Record<string, string>,
        businessFields: string[]
    ): Record<string, string> {
        const prioritized: Record<string, string> = {};
        
        // First, add business-relevant fields
        businessFields.forEach(field => {
            const matchingKey = Object.keys(fields).find(key => 
                key.toLowerCase().includes(field.toLowerCase()) ||
                field.toLowerCase().includes(key.toLowerCase())
            );
            if (matchingKey && !(matchingKey in prioritized)) {
                prioritized[matchingKey] = fields[matchingKey];
            }
        });

        // Then add remaining fields
        Object.entries(fields).forEach(([key, value]) => {
            if (!(key in prioritized)) {
                prioritized[key] = value;
            }
        });

        return prioritized;
    }

    private createStructSummary(typeName: string, fields: string[], hasMore: boolean): string {
        const fieldList = fields.slice(0, 3).join(', ');
        const summary = `${typeName} {${fieldList}${fields.length > 3 ? '...' : ''}}`;
        return hasMore ? `${summary} (${fields.length} fields shown)` : summary;
    }

    private inferFieldType(fieldName: string, value: string): string {
        // Smart type inference based on value patterns
        if (value === 'nil' || value === 'null') return 'nil';
        if (value === 'true' || value === 'false') return 'bool';
        if (/^\d+$/.test(value)) return 'int';
        if (/^\d+\.\d+$/.test(value)) return 'float64';
        if (value.startsWith('"') && value.endsWith('"')) return 'string';
        if (value.includes('0x')) return 'pointer';
        if (value.startsWith('{') && value.endsWith('}')) return 'struct';
        if (value.startsWith('[') && value.endsWith(']')) return 'array';
        
        return 'interface{}';
    }

    private inferElementType(element: string, containerType: string): string {
        // Extract element type from container type
        const match = containerType.match(/\[\](.+)/);
        if (match) return match[1];
        
        return this.inferFieldType('', element);
    }

    private isNilValue(rawValue: string): boolean {
        const nilPatterns = ['nil', 'null', '<nil>', 'undefined'];
        return nilPatterns.some(pattern => rawValue.trim() === pattern);
    }

    private createSimpleValue(
        displayValue: string,
        typeName: string,
        metadata: Partial<SimplifiedValue['metadata']> = {}
    ): SimplifiedValue {
        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore: false,
            metadata: {
                isPointer: false,
                isNil: false,
                ...metadata
            }
        };
    }

    private createTruncatedValue(
        displayValue: string,
        typeName: string,
        reason: string
    ): SimplifiedValue {
        return {
            originalType: typeName,
            displayValue: `${displayValue}... [${reason}]`,
            isExpanded: false,
            hasMore: true,
            metadata: {
                isPointer: false,
                isNil: false,
                truncatedAt: displayValue.length
            }
        };
    }
}