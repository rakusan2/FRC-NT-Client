declare module 'ieee754'{
    /** 
     * Read IEEE754 value from buffer
     * @param buffer The Buffer
     * @param offset Offset into the buffer
     * @param isLE Is little endian
     * @param mLen Mantissa length
     * @param nBytes Number of bytes
     */
    function read(buffer:Buffer,offset:number,isLE:boolean,mLen:number,nBytes:number):number
    /** 
     * Write IEEE754 value to buffer
     * @param buffer The Buffer
     * @param value Value to set
     * @param offset Offset into the buffer
     * @param isLE Is little endian
     * @param mLen Mantissa length
     * @param nBytes Number of bytes
     */
    function write(buffer:Buffer,value:number,offset:number,isLE:boolean,mLen:number,nBytes:number):void
}
